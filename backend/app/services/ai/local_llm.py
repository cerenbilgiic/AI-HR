import json
import re
from typing import Literal

import ollama
from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.services.ai import prompts
from app.services.ai.base import AIProvider, AIResponseError
from app.services.ai.local_stt import LocalWhisperSTT

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)

# Skill names must be Turkish/Latin text only — the local model occasionally
# tacks on stray CJK/other-script fragments (seen in practice, e.g.
# "Veri tabanı管理工作经验"). Reject rather than strip: a partially-mangled
# name is worse than just dropping that one skill.
_CLEAN_SKILL_NAME_RE = re.compile(r"^[A-Za-z0-9ÇçĞğİıÖöŞşÜü .,/()#+&'’-]+$")

# Evaluation criteria are full sentences, so an allowlist like
# _CLEAN_SKILL_NAME_RE above would be too strict (Turkish sentences use a
# wide range of punctuation) — instead deny known non-Turkish scripts.
# Seen in practice: the model occasionally breaks character mid-criterion
# and produces a Chinese conversational reply instead of an actual
# criterion (e.g. "...performansını监控中，暂无结果。您希望我如何继续？...").
# Schema-constrained JSON (see _chat_structured) guarantees the right
# *shape* but not that a string's *content* is a real criterion.
_NON_TURKISH_SCRIPT_RE = re.compile(r"[぀-ヿ㐀-鿿가-힣Ѐ-ӿ]")

# Evidence extraction (see EVIDENCE_EXTRACTION_PROMPT) explicitly asks for a
# single plain sentence, but qwen2.5:7b frequently pastes raw transcript
# labels ("C1:", "S2 cevabı C4:") into the text anyway — sometimes as a
# leading prefix, sometimes restating the question too ("S2: <question>
# C2: <answer>"), sometimes stacking more than one raw Q/A block on
# separate lines, sometimes wrapping the whole thing in literal quote marks
# — observed repeatedly, in varying combinations, even with the prompt
# instruction in place (see backend/scripts/benchmark_final_report_models.py
# for real examples). No JSON schema can enforce content like this, only
# shape, so it's cleaned up here instead. Matches a label wherever it
# appears (not just a leading one), since the model doesn't always put it
# at the very start.
_QA_LABEL_RE = re.compile(r"(?:[SC]\d+\s*(?:cevab[ıi]|ve)?\s*)+:\s*", re.IGNORECASE)


def _clean_evidence_text(text: str) -> str:
    # Only the first line/block: a single evidence item should read as one
    # observation, not a multi-answer transcript dump stacked on separate
    # lines.
    first_line = text.strip().split("\n", 1)[0].strip()
    if len(first_line) >= 2 and first_line[0] == first_line[-1] == '"':
        first_line = first_line[1:-1].strip()
    first_line = _QA_LABEL_RE.sub("", first_line).strip('"').strip()
    return re.sub(r"\s+", " ", first_line)


def _strip_json_fence(text: str) -> str:
    return _JSON_FENCE_RE.sub("", text.strip())


def _parse_json(raw: str) -> dict:
    text = _strip_json_fence(raw)
    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        if exc.msg != "Extra data":
            raise AIResponseError(f"Model did not return valid JSON: {exc}") from exc
        # The model produced a valid JSON object/array followed by trailing text
        # (e.g. stray commentary after the answer) — salvage the leading JSON
        # value instead of failing the whole call over it.
        try:
            value, _ = json.JSONDecoder().raw_decode(text)
        except json.JSONDecodeError as inner_exc:
            raise AIResponseError(f"Model did not return valid JSON: {inner_exc}") from inner_exc
        return value


# --- Schema-constrained response models -----------------------------------
# Passed as `format=<Model>.model_json_schema()` to ollama.Client.chat (see
# _chat_structured below) — Ollama enforces this shape server-side during
# generation, so the model literally cannot return the wrong JSON structure
# (unlike the free-text prompts above, which only ask nicely and rely on
# _parse_json/_get_any/_require_keys to cope when the model doesn't comply).
# This only guarantees *shape*, not content — e.g. it can't stop a skill
# name from containing stray non-Latin characters, so _CLEAN_SKILL_NAME_RE
# below still does real work.


class _EvidenceItemModel(BaseModel):
    competency: str
    evidence: str


class _EvidenceExtractionModel(BaseModel):
    evidence: list[_EvidenceItemModel]


class _CompetencyScoresModel(BaseModel):
    communication: int = Field(ge=0, le=100)
    technical_competency: int = Field(ge=0, le=100)
    problem_solving: int = Field(ge=0, le=100)
    teamwork: int = Field(ge=0, le=100)
    customer_service: int = Field(ge=0, le=100)
    role_fit: int = Field(ge=0, le=100)


class _ScoringModel(BaseModel):
    competency_scores: _CompetencyScoresModel


class _ReportSynthesisModel(BaseModel):
    recommendation: Literal["recommended", "maybe", "not_recommended"]
    strengths: list[str]
    development_areas: list[str]
    summary: str


class _SkillsModel(BaseModel):
    skills: list[str]


class _CriteriaModel(BaseModel):
    criteria: list[str]


def _require_keys(data: dict, keys: list[str]) -> dict:
    missing = [key for key in keys if key not in data]
    if missing:
        raise AIResponseError(f"Model response is missing required keys: {missing}")
    return data


def _get_any(data: dict, *aliases: str):
    """Look up a key by any of several accepted spellings.

    Models don't reliably reproduce ASCII-only Turkish key names verbatim —
    they sometimes "correct" them to proper orthography (e.g. degerlendirilen
    -> değerlendirilen). Accept either spelling instead of hard-failing on it.
    """
    for key in aliases:
        if key in data:
            return data[key]
    raise AIResponseError(f"Model response is missing any of these keys: {aliases}")


class LocalOllamaProvider(AIProvider):
    def __init__(self, model: str | None = None, host: str | None = None) -> None:
        self._client = ollama.Client(host=host or settings.ollama_host)
        self._model = model or settings.ollama_model
        self._stt = LocalWhisperSTT()

    def _chat(self, prompt: str) -> str:
        response = self._client.chat(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            # Ollama unloads a model from memory 5 minutes after its last use by
            # default, and reloading it adds ~15-20s to the next request. Keep it
            # resident longer so a candidate idling between questions/answers
            # doesn't pay that cold-start cost again mid-interview.
            keep_alive="30m",
        )
        return response["message"]["content"]

    def _chat_structured[T: BaseModel](self, prompt: str, schema: type[T]) -> T:
        """Like _chat, but constrains Ollama's generation to `schema`'s JSON
        shape server-side (see the _EvidenceExtractionModel-etc. comment
        above) and parses+validates the result in one step."""
        response = self._client.chat(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
            format=schema.model_json_schema(),
            keep_alive="30m",
        )
        raw = response["message"]["content"]
        try:
            return schema.model_validate_json(raw)
        except ValidationError as exc:
            raise AIResponseError(f"Model response did not match the expected schema: {exc}") from exc

    def generate_questions(
        self, cv_text: str, job_description: str, required_skills: str, count: int = 5
    ) -> list[dict]:
        prompt = prompts.QUESTION_GENERATION_PROMPT.format(
            job_description=job_description,
            required_skills=required_skills,
            cv_text=cv_text,
            count=count,
        )
        data = _require_keys(_parse_json(self._chat(prompt)), ["questions"])
        questions = data["questions"]
        if not isinstance(questions, list):
            raise AIResponseError("Model response's 'questions' field is not a list")

        result = []
        for item in questions:
            if not isinstance(item, dict) or not item.get("question"):
                raise AIResponseError(f"Malformed question item in model response: {item!r}")
            difficulty = item.get("difficulty")
            if difficulty not in ("easy", "medium", "hard"):
                difficulty = "medium"
            category = str(item.get("category") or "general").strip()[:100]
            result.append(
                {
                    "question": item["question"],
                    "category": category,
                    "difficulty": difficulty,
                }
            )
        return result

    def generate_follow_up(self, question: str, answer: str) -> str | None:
        prompt = prompts.FOLLOW_UP_PROMPT.format(question=question, answer=answer)
        raw = self._chat(prompt).strip()
        return raw or None

    def evaluate_and_adapt(
        self, job_description: str, cv_text: str, previous_question: str, candidate_answer: str
    ) -> dict:
        prompt = prompts.ADAPTIVE_EVALUATION_PROMPT.format(
            job_description=job_description,
            cv_text=cv_text,
            previous_question=previous_question,
            candidate_answer=candidate_answer,
        )
        data = _parse_json(self._chat(prompt))
        competency = _get_any(data, "degerlendirilen_yetkinlik", "değerlendirilen_yetkinlik")
        score = _get_any(data, "cevap_puani", "cevap_puanı")
        is_sufficient = _get_any(data, "cevap_yeterli")
        follow_up_needed = _get_any(data, "takip_sorusu_gerekli")
        feedback = data.get("geri_bildirim") or data.get("geribildirim")
        return {
            "competency": str(competency).strip()[:255],
            "score": score,
            "is_sufficient": bool(is_sufficient),
            "follow_up_needed": bool(follow_up_needed),
            "feedback": str(feedback).strip() if feedback else None,
            "next_question": data.get("yeni_soru") or None,
        }

    def evaluate_answer(self, question: str, answer: str, job_description: str) -> dict:
        prompt = prompts.ANSWER_EVALUATION_PROMPT.format(
            job_description=job_description, question=question, answer=answer
        )
        return _parse_json(self._chat(prompt))

    def generate_report(self, transcript: list[dict], job_description: str) -> dict:
        prompt = prompts.REPORT_GENERATION_PROMPT.format(
            job_description=job_description, transcript=json.dumps(transcript)
        )
        return _parse_json(self._chat(prompt))

    def generate_final_report(
        self,
        *,
        job_description: str,
        required_skills: str,
        candidate_profile: str,
        candidate_cv: str,
        questions_and_answers: str,
        answer_evaluations: str,
        evaluation_criteria: str = "",
    ) -> dict:
        """Three sequential, schema-constrained calls instead of one giant
        prompt — see the comment above EVIDENCE_EXTRACTION_PROMPT in
        prompts.py for why. overall_score is deliberately not part of any
        of these schemas: report_service.generate_final_report computes it
        in Python from competency_scores instead of trusting the model's
        arithmetic.

        candidate_profile/candidate_cv are accepted (kept in the AIProvider
        interface — report_service always builds and passes them) but
        deliberately never shown to the model: evaluation is interview-
        answers-only now, see the module comment above
        EVIDENCE_EXTRACTION_PROMPT for why.
        """
        criteria = (
            evaluation_criteria
            or "Bu pozisyon için özel bir değerlendirme kriteri henüz oluşturulmadı; genel yetkinlik çerçevesini kullan."
        )

        extraction_prompt = prompts.EVIDENCE_EXTRACTION_PROMPT.format(
            job_description=job_description,
            evaluation_criteria=criteria,
            questions_and_answers=questions_and_answers,
            answer_evaluations=answer_evaluations,
        )
        extraction = self._chat_structured(extraction_prompt, _EvidenceExtractionModel)
        evidence_dicts = [
            {"competency": item.competency, "evidence": _clean_evidence_text(item.evidence)}
            for item in extraction.evidence
        ]
        evidence_dicts = [e for e in evidence_dicts if e["evidence"]]
        evidence_json = json.dumps(evidence_dicts, ensure_ascii=False)

        scoring_prompt = prompts.COMPETENCY_SCORING_PROMPT.format(
            evaluation_criteria=criteria,
            required_skills=required_skills,
            evidence=evidence_json,
        )
        scoring = self._chat_structured(scoring_prompt, _ScoringModel)

        synthesis_prompt = prompts.REPORT_SYNTHESIS_PROMPT.format(
            job_description=job_description,
            evidence=evidence_json,
            competency_scores=json.dumps(scoring.competency_scores.model_dump(), ensure_ascii=False),
        )
        synthesis = self._chat_structured(synthesis_prompt, _ReportSynthesisModel)

        return {
            "recommendation": synthesis.recommendation,
            "competency_scores": scoring.competency_scores.model_dump(),
            "strengths": synthesis.strengths,
            "development_areas": synthesis.development_areas,
            "summary": synthesis.summary,
            "evidence": evidence_dicts,
        }

    def analyze_cv(self, cv_text: str, job_description: str) -> dict:
        prompt = prompts.CV_ANALYSIS_PROMPT.format(job_description=job_description, cv_text=cv_text)
        return _parse_json(self._chat(prompt))

    def extract_skills(self, cv_text: str, job_description: str) -> list[str]:
        prompt = prompts.CV_SKILL_EXTRACTION_PROMPT.format(job_description=job_description, cv_text=cv_text)
        data = self._chat_structured(prompt, _SkillsModel)
        cleaned = [s.strip() for s in data.skills if s.strip()]
        # Schema enforcement guarantees `skills` is a list[str] shape, but not
        # that each string is clean Latin/Turkish text — see _CLEAN_SKILL_NAME_RE.
        return [s for s in cleaned if _CLEAN_SKILL_NAME_RE.match(s)][:12]

    def generate_evaluation_criteria(self, job_title: str, job_description: str, required_skills: str) -> list[str]:
        prompt = prompts.EVALUATION_CRITERIA_PROMPT.format(
            job_title=job_title, job_description=job_description, required_skills=required_skills
        )
        data = self._chat_structured(prompt, _CriteriaModel)
        cleaned = [c.strip() for c in data.criteria if c.strip()]
        return [c for c in cleaned if not _NON_TURKISH_SCRIPT_RE.search(c)][:8]

    def transcribe(self, audio_path: str) -> str:
        return self._stt.transcribe(audio_path)

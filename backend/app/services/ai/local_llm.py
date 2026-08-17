import json
import re

import ollama

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


_CRITERION_NAME_KEYS = ("criterion_name", "title", "name", "criterion", "kriter", "başlık")
_CRITERION_DESC_KEYS = ("description", "detail", "aciklama", "açıklama", "detay")


def _flatten_criterion(item: object) -> str | None:
    """generate_evaluation_criteria asks for a flat list of strings, but the
    local model frequently ignores that and returns
    {"criterion_name"/"title"/...: "...", "description"/...: "..."} objects
    instead — fold whichever fields it actually used into one readable line
    rather than silently dropping every criterion (seen in practice: this
    happens often enough that a strict isinstance(str) filter returned []
    every time)."""
    if isinstance(item, str):
        return item.strip() or None
    if not isinstance(item, dict):
        return None
    name = next((item[k].strip() for k in _CRITERION_NAME_KEYS if isinstance(item.get(k), str) and item[k].strip()), None)
    desc = next((item[k].strip() for k in _CRITERION_DESC_KEYS if isinstance(item.get(k), str) and item[k].strip()), None)
    if name and desc:
        return f"{name}: {desc}"
    return name or desc


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
        prompt = prompts.FINAL_REPORT_PROMPT.format(
            job_description=job_description,
            required_skills=required_skills,
            candidate_profile=candidate_profile,
            candidate_cv=candidate_cv,
            questions_and_answers=questions_and_answers,
            answer_evaluations=answer_evaluations,
            evaluation_criteria=evaluation_criteria
            or "Bu pozisyon için özel bir değerlendirme kriteri henüz oluşturulmadı; genel yetkinlik çerçevesini kullan.",
        )
        return _parse_json(self._chat(prompt))

    def analyze_cv(self, cv_text: str, job_description: str) -> dict:
        prompt = prompts.CV_ANALYSIS_PROMPT.format(job_description=job_description, cv_text=cv_text)
        return _parse_json(self._chat(prompt))

    def extract_skills(self, cv_text: str, job_description: str) -> list[str]:
        prompt = prompts.CV_SKILL_EXTRACTION_PROMPT.format(job_description=job_description, cv_text=cv_text)
        data = _parse_json(self._chat(prompt))
        skills = data.get("skills", [])
        if not isinstance(skills, list):
            return []
        cleaned = [s.strip() for s in skills if isinstance(s, str) and s.strip()]
        return [s for s in cleaned if _CLEAN_SKILL_NAME_RE.match(s)][:12]

    def generate_evaluation_criteria(self, job_title: str, job_description: str, required_skills: str) -> list[str]:
        prompt = prompts.EVALUATION_CRITERIA_PROMPT.format(
            job_title=job_title, job_description=job_description, required_skills=required_skills
        )
        data = _parse_json(self._chat(prompt))
        raw_criteria = data.get("criteria", [])
        if not isinstance(raw_criteria, list):
            return []
        criteria = [_flatten_criterion(item) for item in raw_criteria]
        return [c for c in criteria if c][:8]

    def transcribe(self, audio_path: str) -> str:
        return self._stt.transcribe(audio_path)

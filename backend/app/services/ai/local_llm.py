import json
import re

import ollama

from app.core.config import settings
from app.services.ai import prompts
from app.services.ai.base import AIProvider
from app.services.ai.local_stt import LocalWhisperSTT

_JSON_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE)


def _strip_json_fence(text: str) -> str:
    return _JSON_FENCE_RE.sub("", text.strip())


class LocalOllamaProvider(AIProvider):
    def __init__(self, model: str | None = None, host: str | None = None) -> None:
        self._client = ollama.Client(host=host or settings.ollama_host)
        self._model = model or settings.ollama_model
        self._stt = LocalWhisperSTT()

    def _chat(self, prompt: str) -> str:
        response = self._client.chat(
            model=self._model,
            messages=[{"role": "user", "content": prompt}],
        )
        return response["message"]["content"]

    def generate_questions(self, cv_text: str, job_description: str, count: int = 5) -> list[str]:
        prompt = prompts.QUESTION_GENERATION_PROMPT.format(
            job_description=job_description, cv_text=cv_text, count=count
        )
        raw = self._chat(prompt)
        return [line.strip("- ").strip() for line in raw.splitlines() if line.strip()]

    def generate_follow_up(self, question: str, answer: str) -> str | None:
        prompt = prompts.FOLLOW_UP_PROMPT.format(question=question, answer=answer)
        raw = self._chat(prompt).strip()
        return raw or None

    def evaluate_answer(self, question: str, answer: str, job_description: str) -> dict:
        prompt = prompts.ANSWER_EVALUATION_PROMPT.format(
            job_description=job_description, question=question, answer=answer
        )
        return json.loads(_strip_json_fence(self._chat(prompt)))

    def generate_report(self, transcript: list[dict], job_description: str) -> dict:
        prompt = prompts.REPORT_GENERATION_PROMPT.format(
            job_description=job_description, transcript=json.dumps(transcript)
        )
        return json.loads(_strip_json_fence(self._chat(prompt)))

    def analyze_cv(self, cv_text: str, job_description: str) -> dict:
        prompt = prompts.CV_ANALYSIS_PROMPT.format(job_description=job_description, cv_text=cv_text)
        return json.loads(_strip_json_fence(self._chat(prompt)))

    def transcribe(self, audio_path: str) -> str:
        return self._stt.transcribe(audio_path)

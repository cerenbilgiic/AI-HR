from abc import ABC, abstractmethod


class AIResponseError(RuntimeError):
    """Raised when the LLM's response doesn't match the JSON shape a caller expects."""


class AIProvider(ABC):
    """Interface for the AI backend used by the interview flow.

    Implemented locally today (Ollama + faster-whisper, see local_llm.py /
    local_stt.py). A cloud provider can be added later by implementing this
    interface without touching any caller.
    """

    @abstractmethod
    def generate_questions(
        self, cv_text: str, job_description: str, required_skills: str, count: int = 5
    ) -> list[dict]:
        ...

    @abstractmethod
    def generate_follow_up(self, question: str, answer: str) -> str | None:
        ...

    @abstractmethod
    def evaluate_and_adapt(
        self, job_description: str, cv_text: str, previous_question: str, candidate_answer: str
    ) -> dict:
        ...

    @abstractmethod
    def evaluate_answer(self, question: str, answer: str, job_description: str) -> dict:
        ...

    @abstractmethod
    def generate_report(self, transcript: list[dict], job_description: str) -> dict:
        ...

    @abstractmethod
    def generate_final_report(
        self,
        *,
        job_description: str,
        required_skills: str,
        candidate_profile: str,
        candidate_cv: str,
        questions_and_answers: str,
        answer_evaluations: str,
    ) -> dict:
        ...

    @abstractmethod
    def analyze_cv(self, cv_text: str, job_description: str) -> dict:
        ...

    @abstractmethod
    def transcribe(self, audio_path: str) -> str:
        ...

from abc import ABC, abstractmethod


class AIProvider(ABC):
    """Interface for the AI backend used by the interview flow.

    Implemented locally today (Ollama + faster-whisper, see local_llm.py /
    local_stt.py). A cloud provider can be added later by implementing this
    interface without touching any caller.
    """

    @abstractmethod
    def generate_questions(self, cv_text: str, job_description: str, count: int = 5) -> list[str]:
        ...

    @abstractmethod
    def generate_follow_up(self, question: str, answer: str) -> str | None:
        ...

    @abstractmethod
    def evaluate_answer(self, question: str, answer: str, job_description: str) -> dict:
        ...

    @abstractmethod
    def generate_report(self, transcript: list[dict], job_description: str) -> dict:
        ...

    @abstractmethod
    def analyze_cv(self, cv_text: str, job_description: str) -> dict:
        ...

    @abstractmethod
    def transcribe(self, audio_path: str) -> str:
        ...

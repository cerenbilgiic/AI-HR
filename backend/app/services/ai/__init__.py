from functools import lru_cache

from app.services.ai.base import AIProvider
from app.services.ai.local_llm import LocalOllamaProvider


@lru_cache
def get_ai_provider() -> AIProvider:
    return LocalOllamaProvider()

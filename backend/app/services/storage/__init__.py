from functools import lru_cache

from app.services.storage.base import MediaStorage
from app.services.storage.local_storage import LocalFileStorage


@lru_cache
def get_media_storage() -> MediaStorage:
    return LocalFileStorage()

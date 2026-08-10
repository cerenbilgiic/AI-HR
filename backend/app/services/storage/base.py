from abc import ABC, abstractmethod
from typing import BinaryIO


class MediaStorage(ABC):
    """Interface for the object store backing recorded interview media.

    Implemented today with MinIO (see minio_storage.py). Keeping this as an
    interface lets tests substitute an in-memory fake without touching a
    real bucket.
    """

    @abstractmethod
    def upload(self, object_key: str, data: BinaryIO, content_type: str, size: int) -> None:
        ...

    @abstractmethod
    def delete(self, object_key: str) -> None:
        ...

    @abstractmethod
    def presigned_url(self, object_key: str, expires_seconds: int = 300) -> str:
        ...

    @abstractmethod
    def download_to_path(self, object_key: str, dest_path: str) -> None:
        ...

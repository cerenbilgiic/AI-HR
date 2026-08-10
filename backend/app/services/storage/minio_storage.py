from datetime import timedelta
from typing import BinaryIO

from minio import Minio

from app.core.config import settings
from app.services.storage.base import MediaStorage


class MinioMediaStorage(MediaStorage):
    def __init__(self, client: Minio | None = None, bucket: str | None = None) -> None:
        self._client = client or Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        self._bucket = bucket or settings.minio_bucket_name
        self._ensure_bucket()

    def _ensure_bucket(self) -> None:
        # No public policy is ever set here — the bucket stays private by
        # default; controlled access happens exclusively through short-lived
        # presigned URLs generated after an authorization check.
        if not self._client.bucket_exists(self._bucket):
            self._client.make_bucket(self._bucket)

    def upload(self, object_key: str, data: BinaryIO, content_type: str, size: int) -> None:
        self._client.put_object(self._bucket, object_key, data, length=size, content_type=content_type)

    def delete(self, object_key: str) -> None:
        self._client.remove_object(self._bucket, object_key)

    def presigned_url(self, object_key: str, expires_seconds: int = 300) -> str:
        return self._client.presigned_get_object(
            self._bucket, object_key, expires=timedelta(seconds=expires_seconds)
        )

    def download_to_path(self, object_key: str, dest_path: str) -> None:
        self._client.fget_object(self._bucket, object_key, dest_path)

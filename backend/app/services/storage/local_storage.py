import shutil
from pathlib import Path
from typing import BinaryIO

from app.core.config import settings
from app.services.storage.base import MediaStorage


class LocalFileStorage(MediaStorage):
    """Stores recorded interview media on the local filesystem, rooted at
    settings.local_media_dir (default C:\\HR-Recordings). object_key already
    looks like "interviews/<session_id>/<uuid>.webm" (see app/api/v1/routers/
    ai.py), so it doubles as a relative path under that root.
    """

    def __init__(self, base_dir: str | None = None) -> None:
        self._base_dir = Path(base_dir or settings.local_media_dir)

    def resolve_path(self, object_key: str) -> Path:
        return self._base_dir / object_key

    def upload(self, object_key: str, data: BinaryIO, content_type: str, size: int) -> None:
        path = self.resolve_path(object_key)
        path.parent.mkdir(parents=True, exist_ok=True)
        with path.open("wb") as f:
            f.write(data.read())

    def delete(self, object_key: str) -> None:
        self.resolve_path(object_key).unlink(missing_ok=True)

    def presigned_url(self, object_key: str, expires_seconds: int = 300) -> str:
        # No real signed-URL mechanism for local disk — access is gated by
        # the /interviews/media/{object_key} endpoint's own HR-only auth
        # instead, so expires_seconds is unused here.
        return f"/api/v1/interviews/media/{object_key}"

    def download_to_path(self, object_key: str, dest_path: str) -> None:
        shutil.copyfile(self.resolve_path(object_key), dest_path)

import io

import pytest

from app.services.storage.local_storage import LocalFileStorage


@pytest.fixture()
def storage(tmp_path):
    return LocalFileStorage(base_dir=str(tmp_path))


def test_upload_writes_file_under_base_dir(storage, tmp_path):
    storage.upload("interviews/1/clip.webm", io.BytesIO(b"hello"), "video/webm", 5)

    path = tmp_path / "interviews" / "1" / "clip.webm"
    assert path.exists()
    assert path.read_bytes() == b"hello"


def test_download_to_path_reads_back_uploaded_bytes(storage, tmp_path):
    storage.upload("interviews/1/clip.webm", io.BytesIO(b"hello"), "video/webm", 5)

    dest = tmp_path / "downloaded.webm"
    storage.download_to_path("interviews/1/clip.webm", str(dest))

    assert dest.read_bytes() == b"hello"


def test_delete_removes_file(storage, tmp_path):
    storage.upload("interviews/1/clip.webm", io.BytesIO(b"hello"), "video/webm", 5)

    storage.delete("interviews/1/clip.webm")

    assert not (tmp_path / "interviews" / "1" / "clip.webm").exists()


def test_delete_missing_file_does_not_raise(storage):
    storage.delete("interviews/1/does-not-exist.webm")


def test_presigned_url_points_at_media_endpoint(storage):
    url = storage.presigned_url("interviews/1/clip.webm")

    assert url == "/api/v1/interviews/media/interviews/1/clip.webm"

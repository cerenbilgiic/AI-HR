from datetime import UTC, datetime, timedelta
from unittest.mock import MagicMock

from app.models.interview import CandidateAnswer
from app.services import data_retention, interview_service


def _audio_files(content_type="audio/webm", data=b"fake-audio-bytes"):
    return {"audio": ("answer.webm", data, content_type)}


def _mock_transcribe(mocker, text="mocked transcript"):
    fake_provider = MagicMock()
    fake_provider.transcribe.return_value = text
    mocker.patch("app.api.v1.routers.ai.get_ai_provider", return_value=fake_provider)
    return fake_provider


# 1. Successful audio upload
def test_transcribe_audio_success(client, as_candidate, interview_session, question, fake_storage, mocker):
    _mock_transcribe(mocker, "hello from the candidate")

    resp = client.post(
        "/api/v1/ai/transcribe",
        data={"session_id": interview_session.id, "question_id": question.id},
        files=_audio_files(content_type="audio/webm"),
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["transcript"] == "hello from the candidate"
    assert body["object_key"].startswith(f"interviews/{interview_session.id}/")
    assert body["object_key"] in fake_storage.objects


# 2. Successful video upload (combined video+audio blob)
def test_transcribe_video_success(client, as_candidate, interview_session, question, fake_storage, mocker):
    _mock_transcribe(mocker, "video answer transcript")

    resp = client.post(
        "/api/v1/ai/transcribe",
        data={"session_id": interview_session.id, "question_id": question.id},
        files=_audio_files(content_type="video/webm"),
    )

    assert resp.status_code == 200
    body = resp.json()
    assert body["transcript"] == "video answer transcript"
    assert body["object_key"] in fake_storage.objects


# Real browsers report MediaRecorder blobs with codec params attached
# (e.g. "video/webm;codecs=vp8,opus") — this must still be accepted.
def test_transcribe_accepts_content_type_with_codec_params(
    client, as_candidate, interview_session, question, fake_storage, mocker
):
    _mock_transcribe(mocker, "codec params transcript")

    resp = client.post(
        "/api/v1/ai/transcribe",
        data={"session_id": interview_session.id, "question_id": question.id},
        files=_audio_files(content_type="video/webm;codecs=vp8,opus"),
    )

    assert resp.status_code == 200
    assert resp.json()["transcript"] == "codec params transcript"


# 3. Invalid file type
def test_transcribe_rejects_invalid_content_type(client, as_candidate, interview_session, question, mocker):
    _mock_transcribe(mocker)

    resp = client.post(
        "/api/v1/ai/transcribe",
        data={"session_id": interview_session.id, "question_id": question.id},
        files=_audio_files(content_type="application/zip"),
    )

    assert resp.status_code == 415


# 4. File size limit exceeded
def test_transcribe_rejects_oversized_file(client, as_candidate, interview_session, question, mocker):
    mocker.patch("app.api.v1.routers.ai.MAX_MEDIA_SIZE_BYTES", 10)
    _mock_transcribe(mocker)

    resp = client.post(
        "/api/v1/ai/transcribe",
        data={"session_id": interview_session.id, "question_id": question.id},
        files=_audio_files(data=b"this payload is longer than ten bytes"),
    )

    assert resp.status_code == 413


# 5. Nonexistent interview/session id (HR auth, so the candidate-ownership
# pre-check doesn't shadow the "not found" case with a 403 instead)
def test_transcribe_nonexistent_session(client, as_hr, mocker):
    _mock_transcribe(mocker)

    resp = client.post(
        "/api/v1/ai/transcribe",
        data={"session_id": 999999, "question_id": 999999},
        files=_audio_files(),
    )

    assert resp.status_code == 404


# 6. Unauthorized access (a different candidate's session)
def test_transcribe_wrong_candidate_forbidden(
    client, as_other_candidate, interview_session, question, mocker
):
    _mock_transcribe(mocker)

    resp = client.post(
        "/api/v1/ai/transcribe",
        data={"session_id": interview_session.id, "question_id": question.id},
        files=_audio_files(),
    )

    assert resp.status_code == 403


# 7. MinIO connection error
def test_transcribe_storage_upload_failure(
    client, as_candidate, interview_session, question, fake_storage, mocker
):
    fake_storage.fail_upload = True
    _mock_transcribe(mocker)

    resp = client.post(
        "/api/v1/ai/transcribe",
        data={"session_id": interview_session.id, "question_id": question.id},
        files=_audio_files(),
    )

    assert resp.status_code == 502


# 8. DB write error after a successful upload -> the just-uploaded object
# must be deleted (orphan prevention), not left behind in the bucket.
def test_transcribe_db_failure_cleans_up_orphaned_object(
    client, as_candidate, interview_session, question, fake_storage, mocker
):
    _mock_transcribe(mocker)
    mocker.patch(
        "app.api.v1.routers.ai.interview_service.attach_media",
        side_effect=RuntimeError("simulated DB failure"),
    )

    resp = client.post(
        "/api/v1/ai/transcribe",
        data={"session_id": interview_session.id, "question_id": question.id},
        files=_audio_files(),
    )

    assert resp.status_code == 500
    assert len(fake_storage.deleted) == 1
    assert fake_storage.objects == {}  # nothing left orphaned in the bucket


# 9. File deletion (via the lifecycle service, since there's no direct
# delete-recording API endpoint in this phase)
def test_delete_expired_media(db_session, fake_storage, interview_session, question):
    answer = CandidateAnswer(
        session_id=interview_session.id,
        question_id=question.id,
        audio_path="interviews/1/old.webm",
        media_filename="old.webm",
        media_content_type="audio/webm",
        media_size=123,
    )
    db_session.add(answer)
    db_session.commit()
    fake_storage.objects["interviews/1/old.webm"] = b"old data"

    # backdate created_at past the retention cutoff
    db_session.query(CandidateAnswer).filter(CandidateAnswer.id == answer.id).update(
        {"created_at": datetime.now(UTC) - timedelta(days=400)}
    )
    db_session.commit()

    deleted_count = data_retention.delete_expired_media(db_session, fake_storage, older_than_days=365)

    assert deleted_count == 1
    assert "interviews/1/old.webm" in fake_storage.deleted
    db_session.refresh(answer)
    assert answer.audio_path is None
    assert answer.media_filename is None


# 10. Presigned URL generation
def test_get_media_url(client, as_hr, db_session, interview_session, question, fake_storage):
    interview_service.attach_media(
        db_session,
        interview_session.id,
        question.id,
        object_key="interviews/42/clip.webm",
        filename="clip.webm",
        content_type="video/webm",
        size=456,
    )

    resp = client.get(f"/api/v1/interviews/{interview_session.id}/answers/{question.id}/media-url")

    assert resp.status_code == 200
    body = resp.json()
    assert "interviews/42/clip.webm" in body["url"]
    assert body["expires_in_seconds"] == 300


def test_get_media_url_no_recording_yet(client, as_hr, interview_session, question):
    resp = client.get(f"/api/v1/interviews/{interview_session.id}/answers/{question.id}/media-url")
    assert resp.status_code == 404


# Deleting a session should also clean up any MinIO objects its answers
# reference, not just the DB rows — otherwise every deleted session leaks
# an orphaned recording.
def test_delete_session_cleans_up_media(
    client, as_hr, db_session, interview_session, question, fake_storage
):
    interview_service.attach_media(
        db_session,
        interview_session.id,
        question.id,
        object_key="interviews/99/to-delete.webm",
        filename="to-delete.webm",
        content_type="video/webm",
        size=10,
    )
    fake_storage.objects["interviews/99/to-delete.webm"] = b"x" * 10

    resp = client.delete(f"/api/v1/interviews/{interview_session.id}")

    assert resp.status_code == 204
    assert "interviews/99/to-delete.webm" in fake_storage.deleted
    assert "interviews/99/to-delete.webm" not in fake_storage.objects

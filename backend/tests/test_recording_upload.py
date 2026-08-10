from datetime import UTC, datetime, timedelta

from app.models.interview import InterviewSession
from app.services import data_retention, interview_service


def _recording_files(content_type="video/webm", data=b"fake-whole-interview-bytes"):
    return {"recording": ("interview.webm", data, content_type)}


def test_upload_recording_success(client, as_candidate, interview_session, fake_storage, db_session):
    resp = client.post(
        f"/api/v1/interviews/{interview_session.id}/recording",
        files=_recording_files(),
    )

    assert resp.status_code == 201
    object_key = resp.json()["object_key"]
    assert object_key == f"interviews/{interview_session.id}/full-recording.webm"
    assert object_key in fake_storage.objects

    db_session.refresh(interview_session)
    assert interview_session.recording_path == object_key
    assert interview_session.recording_content_type == "video/webm"
    assert interview_session.recording_size == len(b"fake-whole-interview-bytes")


def test_upload_recording_rejects_invalid_content_type(client, as_candidate, interview_session):
    resp = client.post(
        f"/api/v1/interviews/{interview_session.id}/recording",
        files=_recording_files(content_type="application/zip"),
    )

    assert resp.status_code == 415


def test_upload_recording_rejects_oversized_file(client, as_candidate, interview_session, mocker):
    mocker.patch("app.api.v1.routers.interviews.MAX_MEDIA_SIZE_BYTES", 10)

    resp = client.post(
        f"/api/v1/interviews/{interview_session.id}/recording",
        files=_recording_files(data=b"this payload is longer than ten bytes"),
    )

    assert resp.status_code == 413


def test_upload_recording_wrong_candidate_forbidden(client, as_other_candidate, interview_session):
    resp = client.post(
        f"/api/v1/interviews/{interview_session.id}/recording",
        files=_recording_files(),
    )

    assert resp.status_code == 403


def test_get_recording_url(client, as_hr, db_session, interview_session):
    interview_service.attach_recording(
        db_session,
        interview_session.id,
        object_key="interviews/1/full-recording.webm",
        filename="interview.webm",
        content_type="video/webm",
        size=999,
    )

    resp = client.get(f"/api/v1/interviews/{interview_session.id}/recording-url")

    assert resp.status_code == 200
    assert "interviews/1/full-recording.webm" in resp.json()["url"]


def test_get_recording_url_no_recording_yet(client, as_hr, interview_session):
    resp = client.get(f"/api/v1/interviews/{interview_session.id}/recording-url")
    assert resp.status_code == 404


def test_delete_session_cleans_up_recording(client, as_hr, db_session, interview_session, fake_storage):
    interview_service.attach_recording(
        db_session,
        interview_session.id,
        object_key="interviews/99/full-recording.webm",
        filename="interview.webm",
        content_type="video/webm",
        size=10,
    )
    fake_storage.objects["interviews/99/full-recording.webm"] = b"x" * 10

    resp = client.delete(f"/api/v1/interviews/{interview_session.id}")

    assert resp.status_code == 204
    assert "interviews/99/full-recording.webm" in fake_storage.deleted
    assert "interviews/99/full-recording.webm" not in fake_storage.objects


def test_delete_expired_media_purges_whole_interview_recording(db_session, fake_storage, interview_session):
    interview_service.attach_recording(
        db_session,
        interview_session.id,
        object_key="interviews/1/full-recording.webm",
        filename="interview.webm",
        content_type="video/webm",
        size=123,
    )
    fake_storage.objects["interviews/1/full-recording.webm"] = b"old data"

    db_session.query(InterviewSession).filter(InterviewSession.id == interview_session.id).update(
        {"created_at": datetime.now(UTC) - timedelta(days=400)}
    )
    db_session.commit()

    deleted_count = data_retention.delete_expired_media(db_session, fake_storage, older_than_days=365)

    assert deleted_count == 1
    assert "interviews/1/full-recording.webm" in fake_storage.deleted
    db_session.refresh(interview_session)
    assert interview_session.recording_path is None
    assert interview_session.recording_filename is None

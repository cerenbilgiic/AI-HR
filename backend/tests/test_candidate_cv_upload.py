from app.api.v1.deps import get_current_user
from app.core.security import create_access_token
from app.main import app


def _cv_files(content_type="application/pdf", data=b"fake-pdf-bytes"):
    return {"cv": ("resume.pdf", data, content_type)}


def test_upload_my_cv_success(client, as_candidate, candidate, fake_storage, db_session):
    resp = client.post("/api/v1/candidates/me/cv", files=_cv_files())

    assert resp.status_code == 201
    body = resp.json()
    assert body["candidate_id"] == candidate.id
    assert body["file_path"].startswith(f"cvs/{candidate.id}/")
    assert body["file_path"] in fake_storage.objects


def test_upload_my_cv_rejects_invalid_content_type(client, as_candidate):
    resp = client.post("/api/v1/candidates/me/cv", files=_cv_files(content_type="application/zip"))

    assert resp.status_code == 415


def test_upload_my_cv_rejects_oversized_file(client, as_candidate, mocker):
    mocker.patch("app.api.v1.routers.candidates.MAX_CV_SIZE_BYTES", 10)

    resp = client.post(
        "/api/v1/candidates/me/cv", files=_cv_files(data=b"this payload is longer than ten bytes")
    )

    assert resp.status_code == 413


def test_upload_my_cv_requires_candidate_auth(client, as_hr):
    resp = client.post("/api/v1/candidates/me/cv", files=_cv_files())

    assert resp.status_code == 401


def test_hr_can_get_cv_file_url(client, as_candidate, candidate, hr_user):
    upload = client.post("/api/v1/candidates/me/cv", files=_cv_files())
    cv_id = upload.json()["id"]

    # as_candidate's override on get_current_user takes priority over any
    # Authorization header, so it has to be swapped out directly (not
    # stackable with another auth fixture within one test) before making
    # the HR-side call.
    app.dependency_overrides[get_current_user] = lambda: hr_user
    response = client.get(f"/api/v1/candidates/{candidate.id}/cvs/{cv_id}/file-url")

    assert response.status_code == 200
    assert "url" in response.json()


def test_cv_file_url_requires_hr_auth(client, candidate):
    # Real JWT decoding path throughout, not the dependency-override
    # fixtures (which bypass get_current_user's own type check) — see
    # test_hr_dashboard.py::test_hr_endpoints_reject_candidate_token.
    token = create_access_token(subject=str(candidate.id), token_type="candidate")
    auth = {"Authorization": f"Bearer {token}"}

    upload = client.post("/api/v1/candidates/me/cv", files=_cv_files(), headers=auth)
    cv_id = upload.json()["id"]

    response = client.get(f"/api/v1/candidates/{candidate.id}/cvs/{cv_id}/file-url", headers=auth)

    assert response.status_code == 401

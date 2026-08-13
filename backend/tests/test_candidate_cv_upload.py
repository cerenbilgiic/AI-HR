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


def test_upload_my_cv_schedules_ai_skill_extraction_in_background(client, as_candidate, candidate, mocker):
    # AI skill extraction runs as a background task (after the response is
    # sent) specifically so a slow/cold local model never delays the CV
    # showing up — see candidate_service.extract_and_merge_cv_skills. Assert
    # it gets scheduled correctly rather than letting it run for real here,
    # matching how transcribe_pending_answers is tested (mocked at the call
    # site, not exercised against a real background SessionLocal()).
    mocker.patch(
        "app.api.v1.routers.candidates.extract_cv_text",
        return_value="Deneyimli perakende satış danışmanı.",
    )
    mock_extract_and_merge = mocker.patch("app.services.candidate_service.extract_and_merge_cv_skills")

    resp = client.post("/api/v1/candidates/me/cv", files=_cv_files())

    assert resp.status_code == 201
    cv_id = resp.json()["id"]
    mock_extract_and_merge.assert_called_once_with(candidate.id, cv_id)


def test_upload_my_cv_skips_ai_skill_extraction_when_text_unreadable(client, as_candidate, mocker):
    # The uploaded bytes in these tests aren't a real PDF, so extraction
    # naturally fails closed (returns "") — no background task scheduled.
    mock_extract_and_merge = mocker.patch("app.services.candidate_service.extract_and_merge_cv_skills")

    resp = client.post("/api/v1/candidates/me/cv", files=_cv_files())

    assert resp.status_code == 201
    mock_extract_and_merge.assert_not_called()


def test_extract_and_merge_cv_skills_merges_without_removing_existing(db_session, candidate, mocker):
    from app.models.candidate import CandidateCV
    from app.services import candidate_service

    cv = CandidateCV(candidate_id=candidate.id, file_path="cvs/1/x.pdf", parsed_text="Deneyimli satış danışmanı.")
    db_session.add(cv)
    db_session.commit()
    db_session.refresh(cv)

    fake_provider = mocker.Mock()
    fake_provider.extract_skills.return_value = ["Envanter Denetimi", "MS Excel"]
    mocker.patch("app.services.candidate_service.get_ai_provider", return_value=fake_provider)
    # The background task opens its own SessionLocal(); point that at this
    # test's isolated, rolled-back session instead of a real connection.
    mocker.patch("app.services.candidate_service.SessionLocal", return_value=db_session)
    mocker.patch.object(db_session, "close", lambda: None)

    before = {s.name for s in candidate.skills}
    candidate_service.extract_and_merge_cv_skills(candidate.id, cv.id)

    db_session.refresh(candidate)
    after = {s.name for s in candidate.skills}
    assert before <= after
    assert {"Envanter Denetimi", "MS Excel"} <= after


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

from app.core.security import verify_password
from app.models.candidate import Candidate
from app.services import invitation_service


def test_issue_credentials_sets_invited_at_and_login_email(client, as_hr, candidate, db_session):
    resp = client.post(f"/api/v1/candidates/{candidate.id}/invite")

    assert resp.status_code == 200
    body = resp.json()
    assert body["candidate_id"] == candidate.id
    assert body["login_email"].endswith("@aday.mulakat.internal")
    assert len(body["password"]) == 10

    db_session.refresh(candidate)
    assert candidate.invited_at is not None
    assert candidate.login_email == body["login_email"]
    # The personal email is untouched — never replaced by the assigned login.
    assert candidate.email != candidate.login_email


def test_issued_password_is_hashed_not_stored_plaintext(client, as_hr, candidate, db_session):
    resp = client.post(f"/api/v1/candidates/{candidate.id}/invite")
    password = resp.json()["password"]

    db_session.refresh(candidate)
    assert candidate.hashed_password != password
    assert verify_password(password, candidate.hashed_password)


def test_resend_keeps_login_email_but_issues_new_password(client, as_hr, candidate, db_session):
    first = client.post(f"/api/v1/candidates/{candidate.id}/invite").json()
    second = client.post(f"/api/v1/candidates/{candidate.id}/invite").json()

    assert second["login_email"] == first["login_email"]
    assert second["password"] != first["password"]

    db_session.refresh(candidate)
    # Only the new password should work now.
    assert verify_password(second["password"], candidate.hashed_password)
    assert not verify_password(first["password"], candidate.hashed_password)


def test_invite_bulk_sends_to_multiple_candidates(client, as_hr, candidate, other_candidate):
    resp = client.post("/api/v1/candidates/invite-bulk", json=[candidate.id, other_candidate.id])

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    assert {b["candidate_id"] for b in body} == {candidate.id, other_candidate.id}
    assert body[0]["login_email"] != body[1]["login_email"]


def test_candidate_can_log_in_with_assigned_credentials(client, as_hr, candidate):
    issued = client.post(f"/api/v1/candidates/{candidate.id}/invite").json()

    resp = client.post(
        "/api/v1/auth/candidate-login",
        json={"email": issued["login_email"], "password": issued["password"]},
    )

    assert resp.status_code == 200
    assert resp.json()["candidate_id"] == candidate.id


def test_candidate_cannot_log_in_with_personal_email(client, as_hr, candidate):
    issued = client.post(f"/api/v1/candidates/{candidate.id}/invite").json()

    resp = client.post(
        "/api/v1/auth/candidate-login",
        json={"email": candidate.email, "password": issued["password"]},
    )

    assert resp.status_code == 401


def test_first_login_at_set_on_first_successful_login(client, as_hr, candidate, db_session):
    issued = client.post(f"/api/v1/candidates/{candidate.id}/invite").json()
    db_session.refresh(candidate)
    assert candidate.first_login_at is None

    client.post(
        "/api/v1/auth/candidate-login",
        json={"email": issued["login_email"], "password": issued["password"]},
    )

    db_session.refresh(candidate)
    assert candidate.first_login_at is not None


def test_issue_credentials_service_directly(db_session, candidate):
    issued = invitation_service.issue_credentials(db_session, candidate)
    assert issued.login_email.endswith("@aday.mulakat.internal")
    assert len(issued.password) == 10


def test_deleting_invited_candidate_does_not_fail_on_fk(client, as_hr, job, db_session):
    # Regression: AuditLog rows reference candidate_id — must be cleared
    # before the candidate row (issue_credentials writes one).
    fresh = Candidate(full_name="Delete Me", email="delete.me.fk-test@example.com", job_id=job.id)
    db_session.add(fresh)
    db_session.commit()

    invite_resp = client.post(f"/api/v1/candidates/{fresh.id}/invite")
    assert invite_resp.status_code == 200

    resp = client.delete(f"/api/v1/candidates/{fresh.id}")

    assert resp.status_code == 204

from datetime import datetime, timedelta

from app.core.config import settings
from app.core.security import decode_access_token
from app.models.ai_score import InterviewReport
from app.models.audit_log import AuditLog
from app.models.candidate import Candidate
from app.models.interview import InterviewSession
from app.services import invitation_service
from tests.conftest import clear_candidate_sessions


def _link_from_body(body: str) -> str:
    # The magic link is the line that's exactly a bare URL, see
    # email_service._html_from_paragraphs / build_invitation_email.
    return next(line for line in body.split("\n") if line.startswith("http"))


def _give_final_decision(db_session, candidate: Candidate, job, decision: str = "recommended") -> None:
    session = InterviewSession(candidate_id=candidate.id, job_id=job.id, status="completed")
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    db_session.add(InterviewReport(session_id=session.id, hr_decision=decision))
    db_session.commit()


def _complete_interview_without_decision(db_session, candidate: Candidate, job) -> None:
    # The (very common) window between "candidate finished, AI evaluated"
    # and "HR actually picked recommended/maybe/not_recommended" — no
    # InterviewReport.hr_decision yet, unlike _give_final_decision above.
    db_session.add(InterviewSession(candidate_id=candidate.id, job_id=job.id, status="completed"))
    db_session.commit()


def test_send_interview_link_sets_invited_at(client, as_hr, candidate, db_session):
    clear_candidate_sessions(db_session, candidate.id)
    resp = client.post(f"/api/v1/candidates/{candidate.id}/invite")

    assert resp.status_code == 200
    body = resp.json()
    assert body["candidate_id"] == candidate.id
    assert body["sent_to"] == candidate.email

    db_session.refresh(candidate)
    assert candidate.invited_at is not None


def test_interview_link_token_is_a_valid_candidate_token(client, as_hr, candidate, db_session):
    # No backend SMTP send for invitations anymore — HR sends from their own
    # Gmail compose draft (see CandidateWorkspace.tsx), so the token is
    # verified via the same preview content the frontend builds that draft
    # from, not a mocked email send.
    clear_candidate_sessions(db_session, candidate.id)
    preview = client.get(f"/api/v1/candidates/{candidate.id}/invite-email").json()

    link = _link_from_body(preview["body"])
    token = link.rsplit("/", 1)[-1]
    payload = decode_access_token(token)
    assert payload["sub"] == str(candidate.id)
    assert payload["type"] == "candidate"


def test_resend_updates_invited_at(client, as_hr, candidate, db_session):
    clear_candidate_sessions(db_session, candidate.id)
    first_resp = client.post(f"/api/v1/candidates/{candidate.id}/invite")
    assert first_resp.status_code == 200
    db_session.refresh(candidate)
    first_invited_at = candidate.invited_at

    second_resp = client.post(f"/api/v1/candidates/{candidate.id}/invite")
    assert second_resp.status_code == 200
    db_session.refresh(candidate)

    assert candidate.invited_at >= first_invited_at


def test_invite_bulk_marks_multiple_candidates(client, as_hr, candidate, other_candidate, db_session):
    clear_candidate_sessions(db_session, candidate.id)
    clear_candidate_sessions(db_session, other_candidate.id)
    resp = client.post("/api/v1/candidates/invite-bulk", json=[candidate.id, other_candidate.id])

    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    assert {b["candidate_id"] for b in body} == {candidate.id, other_candidate.id}


def test_first_login_at_set_on_first_candidates_me_call(client, as_candidate, candidate, db_session):
    # The shared `candidate` fixture is real dev-DB data that may already
    # have been "logged in" by earlier manual testing — reset just the
    # field this test cares about rather than assuming a pristine row.
    candidate.first_login_at = None
    db_session.commit()

    resp = client.get("/api/v1/candidates/me")

    assert resp.status_code == 200
    db_session.refresh(candidate)
    assert candidate.first_login_at is not None


def test_first_login_at_not_overwritten_on_later_calls(client, as_candidate, candidate, db_session):
    first_resp = client.get("/api/v1/candidates/me")
    first_seen = first_resp.json()["first_login_at"]

    second_resp = client.get("/api/v1/candidates/me")

    assert second_resp.json()["first_login_at"] == first_seen


def test_send_interview_link_service_directly(db_session, candidate):
    clear_candidate_sessions(db_session, candidate.id)
    sent = invitation_service.send_interview_link(db_session, candidate)

    assert sent.candidate_id == candidate.id
    assert sent.sent_to == candidate.email
    db_session.refresh(candidate)
    assert candidate.invited_at is not None


def test_preview_invite_email_has_no_side_effects(client, as_hr, candidate, db_session):
    # Same caveat as test_first_login_at_set_on_first_candidates_me_call —
    # the shared fixture can already carry real invited_at/audit-log state
    # from earlier manual testing.
    candidate.invited_at = None
    db_session.query(AuditLog).filter(AuditLog.candidate_id == candidate.id).delete()
    db_session.commit()
    clear_candidate_sessions(db_session, candidate.id)

    resp = client.get(f"/api/v1/candidates/{candidate.id}/invite-email")

    assert resp.status_code == 200
    body = resp.json()
    assert body["to"] == candidate.email
    assert "http" in body["body"]

    db_session.refresh(candidate)
    assert candidate.invited_at is None
    assert db_session.query(AuditLog).filter(AuditLog.candidate_id == candidate.id).count() == 0


def test_preview_and_send_share_the_same_content_builder(db_session, candidate):
    # Different token per call (fresh expiry each time) means the exact
    # link differs, but the surrounding copy — greeting, position name,
    # instructions — must match exactly, since both preview and send call
    # the same private _build_invitation_content helper.
    clear_candidate_sessions(db_session, candidate.id)
    preview = invitation_service.preview_interview_link_email(db_session, candidate)
    built = invitation_service._build_invitation_content(db_session, candidate)

    assert preview.to == built.to
    assert preview.subject == built.subject
    non_link_preview = [p for p in preview.paragraphs if not p.startswith("http")]
    non_link_built = [p for p in built.paragraphs if not p.startswith("http")]
    assert non_link_preview == non_link_built


def test_invite_email_states_the_deadline_date(client, as_hr, candidate, db_session):
    clear_candidate_sessions(db_session, candidate.id)
    resp = client.get(f"/api/v1/candidates/{candidate.id}/invite-email")

    assert resp.status_code == 200
    expected_deadline = datetime.now() + timedelta(days=settings.interview_deadline_days)
    assert expected_deadline.strftime("%d.%m.%Y") in resp.json()["body"]


def test_invite_rejected_once_final_decision_is_set(client, as_hr, candidate, job, db_session):
    _give_final_decision(db_session, candidate, job)

    resp = client.post(f"/api/v1/candidates/{candidate.id}/invite")

    assert resp.status_code == 409


def test_invite_preview_also_rejected_once_final_decision_is_set(client, as_hr, candidate, job, db_session):
    # Regression: the preview response contains a real, sendable magic link
    # — HR's "Gmail'de Aç" is a plain <a href> that opens regardless of
    # whether the later /invite bookkeeping call succeeds, so the link must
    # never be generated in the first place, not just left unrecorded.
    _give_final_decision(db_session, candidate, job)

    resp = client.get(f"/api/v1/candidates/{candidate.id}/invite-email")

    assert resp.status_code == 409


def test_invite_still_allowed_for_a_fresh_candidate(client, as_hr, candidate, db_session):
    clear_candidate_sessions(db_session, candidate.id)
    resp = client.post(f"/api/v1/candidates/{candidate.id}/invite")

    assert resp.status_code == 200


def test_send_interview_link_service_rejects_decided_candidate(db_session, candidate, job):
    _give_final_decision(db_session, candidate, job)

    try:
        invitation_service.send_interview_link(db_session, candidate)
        assert False, "expected ValueError"
    except ValueError as exc:
        assert "tekrar davet gönderilemez" in str(exc).lower()


def test_invite_bulk_skips_decided_candidates_but_sends_to_the_rest(
    client, as_hr, candidate, other_candidate, job, db_session
):
    _give_final_decision(db_session, candidate, job)
    clear_candidate_sessions(db_session, other_candidate.id)

    resp = client.post("/api/v1/candidates/invite-bulk", json=[candidate.id, other_candidate.id])

    assert resp.status_code == 200
    body = resp.json()
    assert [b["candidate_id"] for b in body] == [other_candidate.id]


def test_invite_rejected_once_interview_is_completed_even_without_a_final_decision(
    client, as_hr, candidate, job, db_session
):
    # Regression: this used to only check InterviewReport.hr_decision, so a
    # candidate whose interview was already fully done (AI-evaluated, status
    # completed) but not yet decided on by HR could still be re-invited —
    # a dead link, since create_session refuses a second attempt regardless.
    _complete_interview_without_decision(db_session, candidate, job)

    resp = client.post(f"/api/v1/candidates/{candidate.id}/invite")

    assert resp.status_code == 409


def test_invite_preview_rejected_once_interview_is_completed_even_without_a_final_decision(
    client, as_hr, candidate, job, db_session
):
    _complete_interview_without_decision(db_session, candidate, job)

    resp = client.get(f"/api/v1/candidates/{candidate.id}/invite-email")

    assert resp.status_code == 409


def test_invite_rejected_once_interview_is_in_progress(client, as_hr, candidate, job, db_session):
    # Same dead-link reasoning as the completed-but-undecided case above —
    # any existing session blocks a re-invite, not just a finished one.
    db_session.add(InterviewSession(candidate_id=candidate.id, job_id=job.id, status="in_progress"))
    db_session.commit()

    resp = client.post(f"/api/v1/candidates/{candidate.id}/invite")

    assert resp.status_code == 409


def test_deleting_invited_candidate_does_not_fail_on_fk(client, as_hr, job, db_session):
    # Regression: AuditLog rows reference candidate_id — must not block
    # deleting the candidate row (send_interview_link writes one).
    fresh = Candidate(full_name="Delete Me", email="delete.me.fk-test@example.com", job_id=job.id)
    db_session.add(fresh)
    db_session.commit()

    invite_resp = client.post(f"/api/v1/candidates/{fresh.id}/invite")
    assert invite_resp.status_code == 200
    assert db_session.query(AuditLog).filter(AuditLog.candidate_id == fresh.id).count() == 1

    resp = client.delete(f"/api/v1/candidates/{fresh.id}")

    assert resp.status_code == 204

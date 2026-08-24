from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.models.ai_score import InterviewReport
from app.models.audit_log import AuditLog
from app.models.candidate import Candidate
from app.models.interview import InterviewSession
from app.models.job import Job
from app.services.email_service import build_invitation_email


@dataclass
class SentInvitation:
    candidate_id: int
    sent_to: str


@dataclass
class InvitationEmailContent:
    to: str
    subject: str
    paragraphs: list[str]


def _has_final_decision(db: Session, candidate_id: int) -> bool:
    """True once HR has recorded a final decision (Nihai Karar) on any of
    this candidate's interview reports — create_session already refuses a
    second interview attempt once one exists, so at that point re-inviting
    them can only ever produce a dead link (they have no fresh session to
    start) and, worse, reads as HR still actively considering someone whose
    outcome is already settled."""
    return (
        db.query(InterviewReport)
        .join(InterviewSession, InterviewReport.session_id == InterviewSession.id)
        .filter(InterviewSession.candidate_id == candidate_id, InterviewReport.hr_decision.isnot(None))
        .first()
        is not None
    )


def _build_invitation_content(db: Session, candidate: Candidate) -> InvitationEmailContent:
    """Pure content builder w.r.t. persisted state (no email sent, no
    invited_at/audit log write) — shared by the preview endpoint and the
    actual send below, so what HR sees before sending is exactly what goes
    out. Each call mints a fresh magic-link token; only the one embedded in
    the email that actually gets sent (see send_interview_link) is ever
    usable — a discarded preview token is simply never emailed anywhere.

    The eligibility check happens here rather than only in
    send_interview_link: the preview response *is* a live, sendable magic
    link — HR clicking "Gmail'de Aç" opens a real `<a href>` to Gmail with
    it prefilled, which happens regardless of whether the later /invite
    bookkeeping call succeeds (that's a plain anchor navigation, not gated
    on a JS fetch's outcome). Rejecting only at send-time still lets a
    locked candidate's link be generated and handed to HR to send from
    their own Gmail — the actual point of no return is generating the link
    at all, not recording that it was sent.
    """
    if _has_final_decision(db, candidate.id):
        raise ValueError("Bu aday için nihai karar zaten verildi; tekrar davet gönderilemez.")

    job = db.get(Job, candidate.job_id)
    # Computed here rather than via candidate_service.compute_interview_deadline
    # — that reads the persisted candidate.invited_at, which at this point is
    # still last invite's value (send_interview_link only updates it *after*
    # this call returns) or None on a first invite. This call always mints a
    # brand new token expiring interview_deadline_days from *now*, so the
    # deadline stated in the email must be computed from that same "now" or
    # the two would drift apart on a resend.
    now = datetime.now(timezone.utc)
    token = create_access_token(
        subject=str(candidate.id),
        token_type="candidate",
        expires_minutes=settings.interview_deadline_days * 24 * 60,
    )
    link = f"{settings.frontend_base_url}/interview/enter/{token}"
    deadline = now + timedelta(days=settings.interview_deadline_days)
    subject, paragraphs = build_invitation_email(candidate.full_name, job.title if job else "", link, deadline)
    return InvitationEmailContent(to=candidate.email, subject=subject, paragraphs=paragraphs)


def preview_interview_link_email(db: Session, candidate: Candidate) -> InvitationEmailContent:
    """Lets HR see the invitation email — recipient, subject, and body,
    magic link included — before actually sending it. See
    routers/candidates.py's GET /{candidate_id}/invite-email."""
    return _build_invitation_content(db, candidate)


def send_interview_link(db: Session, candidate: Candidate, actor_id: int | None = None) -> SentInvitation:
    """Marks candidate.email (their real address — there is no separate
    login identity) as invited: invited_at + audit log. The magic link is a
    signed JWT (same mechanism as staff/candidate auth elsewhere, see
    core/security.create_access_token) embedded in the URL — the frontend's
    /interview/enter/:token route exchanges it for a stored session, no
    password involved. Expiry is generous (interview_deadline_days) so a
    candidate hitting the link late gets create_session's normal "deadline
    passed" business error instead of a confusing expired-token error.

    Actual delivery does NOT happen here: the frontend opens the same
    content (fetched via preview_interview_link_email) as a Gmail compose
    draft in HR's own browser/Gmail account and HR sends it themselves —
    see CandidateWorkspace.tsx's confirmSendInvites. This call only records
    that HR completed that flow; there is no backend SMTP send for
    invitations anymore (build_invitation_email/_build_invitation_content
    are still the single source of truth for the draft's content, shared
    with the preview endpoint, so what HR sees in Gmail matches exactly).
    """
    content = _build_invitation_content(db, candidate)

    is_resend = candidate.invited_at is not None
    candidate.invited_at = datetime.now(timezone.utc)

    db.add(
        AuditLog(
            actor_type="hr",
            actor_id=actor_id,
            candidate_id=candidate.id,
            action="interview_link_resent" if is_resend else "interview_link_sent",
        )
    )
    db.commit()
    return SentInvitation(candidate_id=candidate.id, sent_to=content.to)

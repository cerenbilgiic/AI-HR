from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.models.audit_log import AuditLog
from app.models.candidate import Candidate
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


def _build_invitation_content(db: Session, candidate: Candidate) -> InvitationEmailContent:
    """Pure content builder, no side effects (no email sent, no invited_at/
    audit log write) — shared by the preview endpoint and the actual send
    below, so what HR sees before sending is exactly what goes out. Each
    call mints a fresh magic-link token; only the one embedded in the email
    that actually gets sent (see send_interview_link) is ever usable —
    a discarded preview token is simply never emailed anywhere.
    """
    job = db.get(Job, candidate.job_id)
    token = create_access_token(
        subject=str(candidate.id),
        token_type="candidate",
        expires_minutes=settings.interview_deadline_days * 24 * 60,
    )
    link = f"{settings.frontend_base_url}/interview/enter/{token}"
    subject, paragraphs = build_invitation_email(candidate.full_name, job.title if job else "", link)
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

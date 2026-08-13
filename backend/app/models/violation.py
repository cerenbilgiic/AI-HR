from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class InterviewViolation(Base, TimestampMixin):
    """One anti-cheat event during a live interview (tab switch, exiting
    fullscreen, a blocked copy/paste attempt) — see POST
    /interviews/{id}/violations and pages/candidate/Interview.tsx. Distinct
    from AuditLog: this is candidate-behavior-during-interview signal for
    the HR review screen, not a system/HR action trail.
    """

    __tablename__ = "interview_violations"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id"))
    violation_type: Mapped[str] = mapped_column(String(50))

    session: Mapped["InterviewSession"] = relationship()

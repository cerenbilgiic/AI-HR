from datetime import datetime

from sqlalchemy import JSON, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class Candidate(Base, TimestampMixin):
    __tablename__ = "candidates"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255))
    # The candidate's real address — where the interview magic link and
    # decision emails actually go (see invitation_service.py). There is no
    # separate login identity anymore: candidates never authenticate with a
    # password, only via the one-time link emailed here.
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"))

    # Pre-session pipeline state (see invitation_service.py / hrStatus.ts) —
    # None/None = "Beklemede"; invited_at set = "Davet Gönderildi"; both set
    # = "Giriş Yaptı" (candidate actually opened the emailed link). Once an
    # InterviewSession exists, its own status takes over
    # ("Mülakatta"/"Tamamlandı"/"Değerlendirildi").
    invited_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)
    first_login_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    # Set by HR via POST /candidates/{id}/reset-interview-deadline when a
    # candidate's original window closed before they started — see
    # candidate_service.compute_interview_deadline, which uses this instead
    # of created_at as the deadline's baseline once it's set.
    interview_reset_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

    skills: Mapped[list["CandidateSkill"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan"
    )
    cvs: Mapped[list["CandidateCV"]] = relationship(
        back_populates="candidate", cascade="all, delete-orphan"
    )


class CandidateSkill(Base, TimestampMixin):
    __tablename__ = "candidate_skills"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"))
    name: Mapped[str] = mapped_column(String(100))

    candidate: Mapped["Candidate"] = relationship(back_populates="skills")


class CandidateCV(Base, TimestampMixin):
    __tablename__ = "candidate_cvs"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"))
    file_path: Mapped[str] = mapped_column(String(500))
    parsed_text: Mapped[str] = mapped_column(String(10000), nullable=True)
    analysis: Mapped[dict] = mapped_column(JSON, nullable=True)

    candidate: Mapped["Candidate"] = relationship(back_populates="cvs")

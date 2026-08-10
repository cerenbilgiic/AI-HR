from sqlalchemy import JSON, Float, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class AIScore(Base, TimestampMixin):
    __tablename__ = "ai_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id"))
    technical_competency: Mapped[float] = mapped_column(Float, nullable=True)
    communication_skills: Mapped[float] = mapped_column(Float, nullable=True)
    problem_solving: Mapped[float] = mapped_column(Float, nullable=True)
    job_role_compatibility: Mapped[float] = mapped_column(Float, nullable=True)
    response_quality: Mapped[float] = mapped_column(Float, nullable=True)
    confidence: Mapped[float] = mapped_column(Float, nullable=True)
    overall_score: Mapped[float] = mapped_column(Float, nullable=True)

    session: Mapped["InterviewSession"] = relationship()


class InterviewReport(Base, TimestampMixin):
    __tablename__ = "interview_reports"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id"))
    summary: Mapped[str] = mapped_column(Text, nullable=True)
    recommendation: Mapped[str] = mapped_column(Text, nullable=True)

    # Populated by the final report generator (see app/services/report_service.py)
    # — nullable because the older, lighter /evaluate flow (finalize_session)
    # only ever sets summary/recommendation above, not these.
    overall_score: Mapped[int] = mapped_column(Integer, nullable=True)
    competency_scores: Mapped[dict] = mapped_column(JSON, nullable=True)
    strengths: Mapped[list] = mapped_column(JSON, nullable=True)
    development_areas: Mapped[list] = mapped_column(JSON, nullable=True)
    evidence: Mapped[list] = mapped_column(JSON, nullable=True)

    session: Mapped["InterviewSession"] = relationship()

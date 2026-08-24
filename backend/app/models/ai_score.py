from sqlalchemy import JSON, Float, ForeignKey, Integer, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class AIScore(Base, TimestampMixin):
    __tablename__ = "ai_scores"

    id: Mapped[int] = mapped_column(primary_key=True)
    # unique — same reasoning as InterviewReport.session_id below.
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id"), unique=True)
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
    # unique — one report per session. Without this, two concurrent
    # "Evaluate" requests (e.g. HR re-clicking after the AI call seems slow)
    # can both see no existing report and each insert their own row, and
    # code that reads "the" report for a session (e.g. attach_report_summary)
    # can then pick a different, stale row than the one HR is editing — see
    # report_service.generate_final_report for how the insert races this.
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id"), unique=True)
    summary: Mapped[str] = mapped_column(Text, nullable=True)
    # The AI's own advisory suggestion — set once, by generate_final_report,
    # and never touched by HR. Shown to HR as input, not a decision.
    recommendation: Mapped[str] = mapped_column(Text, nullable=True)
    # HR's own call, set only via PUT /reports/session/{id} (the "Nihai
    # Karar" buttons). Starts null regardless of what the AI suggested above
    # — candidate-facing surfaces gate on this being set, not on `recommendation`
    # or on session.status alone, so nothing reaches the candidate before a
    # human has actually decided.
    hr_decision: Mapped[str] = mapped_column(Text, nullable=True)
    # Which hr_decision value the result email has already gone out for —
    # not a bool, so that changing hr_decision later (recommended -> maybe,
    # say) naturally re-enables sending again, while re-sending for the
    # *same*, unchanged decision is blocked (see routers/reports.py's
    # send_decision_email).
    decision_email_sent_for: Mapped[str] = mapped_column(Text, nullable=True)

    # Populated by the final report generator (see app/services/report_service.py)
    # — nullable because the older, lighter /evaluate flow (finalize_session)
    # only ever sets summary/recommendation above, not these.
    overall_score: Mapped[int] = mapped_column(Integer, nullable=True)
    competency_scores: Mapped[dict] = mapped_column(JSON, nullable=True)
    strengths: Mapped[list] = mapped_column(JSON, nullable=True)
    development_areas: Mapped[list] = mapped_column(JSON, nullable=True)
    evidence: Mapped[list] = mapped_column(JSON, nullable=True)

    session: Mapped["InterviewSession"] = relationship()

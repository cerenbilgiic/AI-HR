from sqlalchemy import Boolean, Float, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class AIEvaluation(Base, TimestampMixin):
    __tablename__ = "ai_evaluations"

    id: Mapped[int] = mapped_column(primary_key=True)
    answer_id: Mapped[int] = mapped_column(ForeignKey("candidate_answers.id"), unique=True)
    competency: Mapped[str] = mapped_column(String(255), nullable=True)
    score: Mapped[float] = mapped_column(Float, nullable=True)
    is_sufficient: Mapped[bool] = mapped_column(Boolean, default=False)
    follow_up_needed: Mapped[bool] = mapped_column(Boolean, default=False)

    answer: Mapped["CandidateAnswer"] = relationship()

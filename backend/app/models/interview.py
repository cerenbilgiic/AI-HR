from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class InterviewSession(Base, TimestampMixin):
    __tablename__ = "interview_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"))
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"))
    status: Mapped[str] = mapped_column(String(50), default="pending")

    questions: Mapped[list["InterviewQuestion"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )
    answers: Mapped[list["CandidateAnswer"]] = relationship(
        back_populates="session", cascade="all, delete-orphan"
    )


class InterviewQuestion(Base, TimestampMixin):
    __tablename__ = "interview_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id"))
    text: Mapped[str] = mapped_column(Text)
    order: Mapped[int] = mapped_column(default=0)
    is_follow_up: Mapped[bool] = mapped_column(default=False)

    session: Mapped["InterviewSession"] = relationship(back_populates="questions")
    answer: Mapped["CandidateAnswer"] = relationship(back_populates="question", uselist=False)


class CandidateAnswer(Base, TimestampMixin):
    __tablename__ = "candidate_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id"))
    question_id: Mapped[int] = mapped_column(ForeignKey("interview_questions.id"))
    transcript: Mapped[str] = mapped_column(Text, nullable=True)
    audio_path: Mapped[str] = mapped_column(String(500), nullable=True)

    session: Mapped["InterviewSession"] = relationship(back_populates="answers")
    question: Mapped["InterviewQuestion"] = relationship(back_populates="answer")

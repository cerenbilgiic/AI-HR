from sqlalchemy import BigInteger, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class InterviewSession(Base, TimestampMixin):
    __tablename__ = "interview_sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"))
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"))
    status: Mapped[str] = mapped_column(String(50), default="pending")

    # One continuous recording for the whole interview (see
    # POST /interviews/{id}/recording), replacing the earlier per-question
    # recordings on CandidateAnswer for new interviews.
    recording_path: Mapped[str] = mapped_column(String(500), nullable=True)
    recording_filename: Mapped[str] = mapped_column(String(255), nullable=True)
    recording_content_type: Mapped[str] = mapped_column(String(100), nullable=True)
    recording_size: Mapped[int] = mapped_column(BigInteger, nullable=True)

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
    category: Mapped[str] = mapped_column(String(100), nullable=True)
    difficulty: Mapped[str] = mapped_column(String(20), nullable=True)

    session: Mapped["InterviewSession"] = relationship(back_populates="questions")
    answer: Mapped["CandidateAnswer"] = relationship(back_populates="question", uselist=False)


class CandidateAnswer(Base, TimestampMixin):
    __tablename__ = "candidate_answers"

    id: Mapped[int] = mapped_column(primary_key=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("interview_sessions.id"))
    question_id: Mapped[int] = mapped_column(ForeignKey("interview_questions.id"))
    transcript: Mapped[str] = mapped_column(Text, nullable=True)
    # Holds a MinIO object key (e.g. "interviews/42/<uuid>.webm"), not a
    # filesystem path, despite the name — kept as-is to avoid an unnecessary
    # rename/migration; see media_filename/content_type/size below for the
    # rest of the object's metadata.
    audio_path: Mapped[str] = mapped_column(String(500), nullable=True)
    media_filename: Mapped[str] = mapped_column(String(255), nullable=True)
    media_content_type: Mapped[str] = mapped_column(String(100), nullable=True)
    media_size: Mapped[int] = mapped_column(BigInteger, nullable=True)

    session: Mapped["InterviewSession"] = relationship(back_populates="answers")
    question: Mapped["InterviewQuestion"] = relationship(back_populates="answer")
    evaluation: Mapped["AIEvaluation"] = relationship(back_populates="answer", uselist=False)

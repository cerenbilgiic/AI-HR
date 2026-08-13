from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class Job(Base, TimestampMixin):
    __tablename__ = "jobs"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text)
    department: Mapped[str] = mapped_column(String(100), nullable=True)
    location: Mapped[str] = mapped_column(String(100), nullable=True)
    created_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"))

    created_by: Mapped["User"] = relationship()
    skills: Mapped[list["JobSkill"]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )
    questions: Mapped[list["JobQuestion"]] = relationship(
        back_populates="job", cascade="all, delete-orphan"
    )

    @property
    def created_by_name(self) -> str | None:
        """Lets JobOut expose the owner's display name via from_attributes
        without every jobs.py route having to resolve it manually."""
        return self.created_by.full_name if self.created_by else None


class JobSkill(Base, TimestampMixin):
    __tablename__ = "job_skills"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"))
    name: Mapped[str] = mapped_column(String(100))
    required_level: Mapped[str] = mapped_column(String(50), nullable=True)

    job: Mapped["Job"] = relationship(back_populates="skills")


class JobQuestion(Base, TimestampMixin):
    """A fixed interview question HR authored for this job — every
    candidate applying to this job is asked the same set, in order (see
    interview_service.create_session)."""

    __tablename__ = "job_questions"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"))
    text: Mapped[str] = mapped_column(Text)
    order: Mapped[int] = mapped_column(default=0)

    job: Mapped["Job"] = relationship(back_populates="questions")

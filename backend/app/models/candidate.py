from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class Candidate(Base, TimestampMixin):
    __tablename__ = "candidates"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(255))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(50), nullable=True)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"))

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

    candidate: Mapped["Candidate"] = relationship(back_populates="cvs")

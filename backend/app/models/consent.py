from sqlalchemy import Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.mixins import TimestampMixin


class ConsentRecord(Base, TimestampMixin):
    __tablename__ = "consent_records"

    id: Mapped[int] = mapped_column(primary_key=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"))
    camera_access: Mapped[bool] = mapped_column(Boolean, default=False)
    microphone_access: Mapped[bool] = mapped_column(Boolean, default=False)
    audio_recording: Mapped[bool] = mapped_column(Boolean, default=False)
    video_recording: Mapped[bool] = mapped_column(Boolean, default=False)
    ai_evaluation: Mapped[bool] = mapped_column(Boolean, default=False)
    kvkk_consent: Mapped[bool] = mapped_column(Boolean, default=False)

    candidate: Mapped["Candidate"] = relationship()

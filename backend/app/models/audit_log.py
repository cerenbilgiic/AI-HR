from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class AuditLog(Base, TimestampMixin):
    """Who did what, when — invitation sends/resends/redemptions and bulk
    imports (see invitation_service.py, candidate_import_service.py).
    Write-only from the app's perspective for now: captured for
    traceability, no browsing UI built yet.
    """

    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    actor_type: Mapped[str] = mapped_column(String(20))  # "hr" | "system"
    actor_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    candidate_id: Mapped[int] = mapped_column(ForeignKey("candidates.id"), nullable=True)
    action: Mapped[str] = mapped_column(String(50))
    detail: Mapped[dict] = mapped_column(JSON, nullable=True)

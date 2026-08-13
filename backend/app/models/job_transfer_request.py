from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base
from app.models.mixins import TimestampMixin


class JobTransferRequest(Base, TimestampMixin):
    """A pending/approved/rejected request to reassign a Job's created_by_id
    to another staff member. created_by_id only actually changes once the
    recipient (to_user_id) approves — see job_service.respond_to_transfer_request.
    requested_by_id can differ from from_user_id: an hr_manager may initiate
    a transfer on behalf of an hr-role account they manage, but the
    recipient still has to approve it either way."""

    __tablename__ = "job_transfer_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(ForeignKey("jobs.id"))
    # Nullable, not because a request can be created without these, but so a
    # completed request stays a historical record instead of blocking
    # deletion of an old owner/requester forever — see
    # user_service.delete_user, which nulls these out before deleting.
    from_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    to_user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    requested_by_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(20), default="pending")
    responded_at: Mapped[datetime] = mapped_column(DateTime, nullable=True)

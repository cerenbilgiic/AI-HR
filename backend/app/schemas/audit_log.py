from datetime import datetime

from pydantic import BaseModel


class AuditLogOut(BaseModel):
    id: int
    created_at: datetime
    actor_type: str
    # Resolved server-side (not raw ids) so the frontend doesn't need a
    # second round-trip to /users or /candidates just to label a row.
    actor_name: str | None
    candidate_name: str | None
    action: str
    detail: dict | None

    model_config = {"from_attributes": True}

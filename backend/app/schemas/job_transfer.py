from datetime import datetime

from pydantic import BaseModel


class JobTransferRequestIn(BaseModel):
    to_user_id: int


class JobTransferRespond(BaseModel):
    approve: bool


class JobTransferRequestOut(BaseModel):
    id: int
    job_id: int
    job_title: str
    from_user_id: int | None
    from_user_name: str | None
    to_user_id: int | None
    to_user_name: str | None
    requested_by_id: int | None
    requested_by_name: str | None
    status: str
    created_at: datetime
    responded_at: datetime | None

    model_config = {"from_attributes": True}

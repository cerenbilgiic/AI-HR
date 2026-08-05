from pydantic import BaseModel, EmailStr


class CandidateCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: str | None = None
    job_id: int


class CandidateOut(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    phone: str | None
    job_id: int

    model_config = {"from_attributes": True}


class ConsentIn(BaseModel):
    camera_access: bool
    microphone_access: bool
    audio_recording: bool
    video_recording: bool
    ai_evaluation: bool


class ConsentOut(ConsentIn):
    id: int
    candidate_id: int

    model_config = {"from_attributes": True}

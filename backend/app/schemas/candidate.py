from pydantic import BaseModel, EmailStr, Field


class CandidateCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: str | None = None
    job_id: int
    password: str = Field(min_length=8)


class CandidateUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    job_id: int | None = None


class CandidateOut(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    phone: str | None
    job_id: int

    model_config = {"from_attributes": True}


class CandidateSkillIn(BaseModel):
    name: str


class CandidateSkillUpdate(BaseModel):
    name: str | None = None


class CandidateSkillOut(CandidateSkillIn):
    id: int
    candidate_id: int

    model_config = {"from_attributes": True}


class CandidateCVCreate(BaseModel):
    file_path: str
    parsed_text: str | None = None


class CandidateCVUpdate(BaseModel):
    file_path: str | None = None
    parsed_text: str | None = None


class CandidateCVOut(BaseModel):
    id: int
    candidate_id: int
    file_path: str
    parsed_text: str | None
    analysis: dict | None = None

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

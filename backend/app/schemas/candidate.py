from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class CandidateCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: str | None = None
    job_id: int
    # None for candidates created without a chosen password (e.g. CSV
    # import, see candidate_import_service.py) — they can only authenticate
    # via a magic-link invitation, never candidate-login.
    password: str | None = Field(default=None, min_length=8)


class CandidateUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    job_id: int | None = None


class CandidateSelfUpdate(BaseModel):
    """Candidate-only self-service profile edit — see PUT /candidates/me.
    Deliberately narrower than CandidateUpdate: no email (their login
    credential) or job_id (HR-managed), just the safe display fields.
    """

    full_name: str | None = None
    phone: str | None = None


class CandidateOut(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    phone: str | None
    job_id: int
    created_at: datetime
    # System-assigned login identifier, distinct from email above — see
    # invitation_service.issue_credentials. None until first invited.
    login_email: str | None = None
    # Pre-session pipeline state — see hrStatus.ts's status derivation.
    invited_at: datetime | None = None
    first_login_at: datetime | None = None

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
    kvkk_consent: bool


class ConsentOut(ConsentIn):
    id: int
    candidate_id: int

    model_config = {"from_attributes": True}


class CandidateDetailOut(CandidateOut):
    """Used only by GET /candidates/{id} and GET /candidates/me — the list
    endpoint stays on the lean CandidateOut so it doesn't pull full CV text
    per row."""

    cvs: list[CandidateCVOut] = []
    skills: list[CandidateSkillOut] = []
    # Attached by the router before serialization (transient, not a mapped
    # column) — see candidate_service.compute_interview_deadline.
    interview_deadline: datetime | None = None

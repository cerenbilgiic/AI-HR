from pydantic import BaseModel


class JobSkillIn(BaseModel):
    name: str
    required_level: str | None = None


class JobSkillOut(JobSkillIn):
    id: int

    model_config = {"from_attributes": True}


class JobSkillUpdate(BaseModel):
    name: str | None = None
    required_level: str | None = None


class JobQuestionIn(BaseModel):
    text: str
    order: int = 0


class JobQuestionOut(JobQuestionIn):
    id: int

    model_config = {"from_attributes": True}


class JobQuestionUpdate(BaseModel):
    text: str | None = None
    order: int | None = None


class JobCreate(BaseModel):
    title: str
    description: str
    department: str | None = None
    location: str | None = None
    skills: list[JobSkillIn] = []
    questions: list[JobQuestionIn] = []


class JobUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    department: str | None = None
    location: str | None = None


class JobOut(BaseModel):
    id: int
    title: str
    description: str
    department: str | None
    location: str | None
    created_by_id: int
    created_by_name: str | None = None
    skills: list[JobSkillOut] = []
    questions: list[JobQuestionOut] = []

    model_config = {"from_attributes": True}

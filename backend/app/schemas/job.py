from pydantic import BaseModel


class JobSkillIn(BaseModel):
    name: str
    required_level: str | None = None


class JobSkillOut(JobSkillIn):
    id: int

    model_config = {"from_attributes": True}


class JobCreate(BaseModel):
    title: str
    description: str
    department: str | None = None
    location: str | None = None
    skills: list[JobSkillIn] = []


class JobOut(BaseModel):
    id: int
    title: str
    description: str
    department: str | None
    location: str | None
    skills: list[JobSkillOut] = []

    model_config = {"from_attributes": True}

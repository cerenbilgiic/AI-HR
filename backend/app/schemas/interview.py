from pydantic import BaseModel


class InterviewSessionCreate(BaseModel):
    candidate_id: int
    job_id: int


class InterviewQuestionOut(BaseModel):
    id: int
    text: str
    order: int
    is_follow_up: bool

    model_config = {"from_attributes": True}


class InterviewSessionOut(BaseModel):
    id: int
    candidate_id: int
    job_id: int
    status: str
    questions: list[InterviewQuestionOut] = []

    model_config = {"from_attributes": True}


class AnswerSubmit(BaseModel):
    question_id: int
    transcript: str | None = None
    audio_path: str | None = None

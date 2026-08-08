from pydantic import BaseModel


class InterviewQuestionOut(BaseModel):
    id: int
    text: str
    order: int
    is_follow_up: bool
    category: str | None = None
    difficulty: str | None = None

    model_config = {"from_attributes": True}


class InterviewQuestionCreate(BaseModel):
    text: str
    order: int = 0
    is_follow_up: bool = False


class InterviewQuestionUpdate(BaseModel):
    text: str | None = None
    order: int | None = None
    is_follow_up: bool | None = None


class InterviewSessionOut(BaseModel):
    id: int
    candidate_id: int
    job_id: int
    status: str
    questions: list[InterviewQuestionOut] = []

    model_config = {"from_attributes": True}


class InterviewSessionStatusUpdate(BaseModel):
    status: str


class AnswerSubmit(BaseModel):
    question_id: int
    transcript: str | None = None
    audio_path: str | None = None

from pydantic import BaseModel

from app.schemas.interview import InterviewQuestionOut


class AIQuestionItem(BaseModel):
    question: str
    category: str
    difficulty: str


class AIGenerateQuestionsRequest(BaseModel):
    job_id: int
    candidate_id: int
    number_of_questions: int = 5


class AIGenerateQuestionsResponse(BaseModel):
    session_id: int
    questions: list[AIQuestionItem]


class AIEvaluateAnswerRequest(BaseModel):
    session_id: int
    question_id: int
    candidate_answer: str


class AIEvaluationOut(BaseModel):
    competency: str | None
    score: float | None
    is_sufficient: bool
    follow_up_needed: bool
    feedback: str | None = None
    next_question: InterviewQuestionOut | None = None

    model_config = {"from_attributes": True}


class AITranscribeResponse(BaseModel):
    transcript: str
    object_key: str


class AIMediaUrlResponse(BaseModel):
    url: str
    expires_in_seconds: int

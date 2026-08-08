from pydantic import BaseModel

from app.schemas.interview import InterviewQuestionOut


class AIQuestionItem(BaseModel):
    question: str
    category: str
    difficulty: str


class AIGenerateQuestionsRequest(BaseModel):
    candidate_id: int
    count: int = 5


class AIGenerateQuestionsResponse(BaseModel):
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
    next_question: InterviewQuestionOut | None = None

    model_config = {"from_attributes": True}

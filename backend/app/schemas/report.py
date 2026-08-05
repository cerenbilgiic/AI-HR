from pydantic import BaseModel


class AIScoreOut(BaseModel):
    technical_competency: float | None
    communication_skills: float | None
    problem_solving: float | None
    job_role_compatibility: float | None
    response_quality: float | None
    confidence: float | None
    overall_score: float | None

    model_config = {"from_attributes": True}


class InterviewReportOut(BaseModel):
    id: int
    session_id: int
    summary: str | None
    recommendation: str | None
    scores: AIScoreOut | None = None

    model_config = {"from_attributes": True}

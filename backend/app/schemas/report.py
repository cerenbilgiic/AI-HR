from typing import Literal

from pydantic import BaseModel, Field

RecommendationEnum = Literal["recommended", "maybe", "not_recommended"]


class CompetencyScores(BaseModel):
    communication: int = Field(ge=0, le=100)
    technical_competency: int = Field(ge=0, le=100)
    problem_solving: int = Field(ge=0, le=100)
    teamwork: int = Field(ge=0, le=100)
    customer_service: int = Field(ge=0, le=100)
    role_fit: int = Field(ge=0, le=100)


class EvidenceItem(BaseModel):
    competency: str
    evidence: str


class FinalReportLLMResponse(BaseModel):
    """Validates the raw dict returned by AIProvider.generate_final_report
    before anything is written to MySQL — see app/services/report_service.py.
    """

    overall_score: int = Field(ge=0, le=100)
    recommendation: RecommendationEnum
    competency_scores: CompetencyScores
    strengths: list[str]
    development_areas: list[str]
    summary: str
    evidence: list[EvidenceItem]


class AIScoreOut(BaseModel):
    technical_competency: float | None
    communication_skills: float | None
    problem_solving: float | None
    job_role_compatibility: float | None
    response_quality: float | None
    confidence: float | None
    overall_score: float | None

    model_config = {"from_attributes": True}


class AIScoreUpdate(BaseModel):
    technical_competency: float | None = None
    communication_skills: float | None = None
    problem_solving: float | None = None
    job_role_compatibility: float | None = None
    response_quality: float | None = None
    confidence: float | None = None
    overall_score: float | None = None


class InterviewReportOut(BaseModel):
    id: int
    session_id: int
    summary: str | None
    recommendation: str | None
    hr_decision: str | None = None
    scores: AIScoreOut | None = None
    # Populated only by the final report generator (report_service.py) —
    # None for reports created by the older, lighter /evaluate flow.
    overall_score: int | None = None
    competency_scores: CompetencyScores | None = None
    strengths: list[str] | None = None
    development_areas: list[str] | None = None
    evidence: list[EvidenceItem] | None = None

    model_config = {"from_attributes": True}


class InterviewReportUpdate(BaseModel):
    summary: str | None = None
    # HR's own decision — validated against the same enum as the AI's
    # suggestion so a bad value 400s instead of silently corrupting the
    # field. This is deliberately not `recommendation`: that field is the
    # AI's advisory output and must never be overwritten by this endpoint.
    hr_decision: RecommendationEnum | None = None

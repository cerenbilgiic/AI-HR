from datetime import datetime
from typing import Literal

from pydantic import BaseModel


class AnswerEvaluationOut(BaseModel):
    competency: str | None
    score: float | None
    feedback: str | None

    model_config = {"from_attributes": True}


class CandidateAnswerOut(BaseModel):
    id: int
    transcript: str | None
    created_at: datetime
    evaluation: AnswerEvaluationOut | None = None
    # Non-null means the candidate spoke an answer in this time window, even
    # if transcript ended up blank (e.g. speech-to-text couldn't make out
    # anything) — lets the UI say "verbal answer, no transcript" instead of
    # "left blank".
    recording_start_offset_seconds: float | None = None

    model_config = {"from_attributes": True}


class InterviewQuestionOut(BaseModel):
    id: int
    text: str
    order: int
    is_follow_up: bool
    category: str | None = None
    difficulty: str | None = None
    answer: CandidateAnswerOut | None = None

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
    created_at: datetime
    updated_at: datetime
    recording_path: str | None = None
    # Populated by interview_service.attach_report_summary — not a mapped
    # column, see that function for why it's not baked into get_session.
    overall_score: int | None = None
    recommendation: str | None = None
    # HR's own decision (InterviewReport.hr_decision), distinct from the AI's
    # `recommendation` above — candidate-facing pages must gate on this being
    # non-null, never on `recommendation` or on status == "completed" alone.
    hr_decision: str | None = None
    # Also populated by attach_report_summary — the report's own created_at,
    # distinct from the session's, so the dashboard can compute "reports
    # generated this month vs last month" without an extra request.
    report_created_at: datetime | None = None
    # Populated by interview_service.attach_completion_stats — see that
    # function for why duration can't just be updated_at - created_at.
    duration_minutes: int | None = None
    answered_count: int | None = None
    questions: list[InterviewQuestionOut] = []
    # Anti-cheat signal — risk_score is a real column (set at completion,
    # see interview_service.complete_session/terminate_session);
    # violation_counts is transient, populated by attach_violation_summary.
    risk_score: int | None = None
    violation_counts: dict[str, int] | None = None

    model_config = {"from_attributes": True}


class InterviewSessionStatusUpdate(BaseModel):
    status: str


class InterviewViolationCreate(BaseModel):
    violation_type: str


class AnswerSubmit(BaseModel):
    question_id: int
    transcript: str | None = None
    audio_path: str | None = None
    is_timeout: bool = False
    # "voice" exempts the transcript from the word-count limit in
    # text_quality.validate_answer_text — a candidate speaking freely
    # shouldn't be capped the way a typed answer is. Defaults to "written"
    # so any caller that omits it keeps the limit enforced.
    answer_mode: Literal["voice", "written"] = "written"
    # Seconds into the session's continuous recording where this answer's
    # verbal response starts/ends — used post-interview to slice out audio
    # for STT (see app/services/transcription_service.py). Harmless to send
    # even when transcript is already set (typed answers never get sliced).
    recording_start_offset_seconds: float | None = None
    recording_end_offset_seconds: float | None = None

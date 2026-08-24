from datetime import datetime

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.ai_evaluation import AIEvaluation
from app.models.ai_score import AIScore, InterviewReport
from app.models.candidate import Candidate
from app.models.interview import CandidateAnswer, InterviewQuestion, InterviewSession
from app.models.job import Job
from app.models.violation import InterviewViolation
from app.schemas.interview import (
    AnswerSubmit,
    InterviewQuestionCreate,
    InterviewQuestionUpdate,
    InterviewSessionStatusUpdate,
)
from app.schemas.report import AIScoreUpdate, InterviewReportUpdate
from app.services.ai import get_ai_provider
from app.services.candidate_service import compute_interview_deadline
from app.services.storage import MediaStorage
from app.services.text_quality import validate_answer_text

MAX_ADAPTIVE_QUESTIONS = 8

# generate_report (finalize_session's older, unvalidated flow — unlike
# report_service.generate_final_report, its output isn't schema-constrained)
# has been observed returning English phrases like "Consider"/"Do Not
# Recommend" instead of the requested recommended/maybe/not_recommended
# enum. RecommendationBadge renders whatever string it's given, so garbage
# here shows up verbatim in the shared HR UI — normalize known variants,
# drop anything else, rather than writing it straight to the DB.
_RECOMMENDATION_ALIASES = {
    "recommended": "recommended",
    "maybe": "maybe",
    "not_recommended": "not_recommended",
    "consider": "maybe",
    "do not recommend": "not_recommended",
    "not recommended": "not_recommended",
    "recommend": "recommended",
}


def _normalize_recommendation(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    return _RECOMMENDATION_ALIASES.get(value.strip().lower())


def _risk_score_from_violation_count(count: int) -> int:
    return min(100, count * 20)


def _format_required_skills(job: Job | None) -> str:
    if job is None or not job.skills:
        return ""
    return ", ".join(
        f"{skill.name} ({skill.required_level})" if skill.required_level else skill.name
        for skill in job.skills
    )


def create_session(db: Session, candidate: Candidate) -> InterviewSession:
    """Copies the job's HR-authored questions (JobQuestion, managed via
    /jobs/{id}/questions) into a new session, in order — every candidate for
    a job is asked the same fixed set. No AI call: question authorship is
    entirely HR's, not generated (see generate_questions/QUESTION_GENERATION_PROMPT,
    left in place but no longer called by this flow)."""
    # One attempt only — a candidate must never be able to get a fresh
    # session (new questions, reset progress) just by reloading the page
    # after an abandoned in_progress session. The frontend resumes an
    # in_progress session in place instead of calling this again; this
    # check is the hard backend guard against that being bypassed.
    existing = (
        db.query(InterviewSession)
        .filter(InterviewSession.candidate_id == candidate.id)
        .order_by(InterviewSession.id.desc())
        .first()
    )
    if existing is not None:
        if existing.status == "terminated":
            raise ValueError(
                "Your interview was terminated for leaving the interview screen and cannot be restarted"
            )
        if existing.status == "in_progress":
            raise ValueError("You already have an interview in progress")
        raise ValueError("You have already completed your interview for this application")

    # compute_interview_deadline is naive (candidate.created_at comes from
    # MySQL's naive func.now()) — compare against a naive "now" too, not
    # datetime.now(timezone.utc), or this raises on the comparison.
    if datetime.now() > compute_interview_deadline(candidate):
        raise ValueError("The interview deadline for this application has passed")

    job = db.get(Job, candidate.job_id)
    if not job or not job.questions:
        raise ValueError("This job has no interview questions configured yet")

    session = InterviewSession(candidate_id=candidate.id, job_id=candidate.job_id, status="in_progress")
    session.questions = [
        InterviewQuestion(text=q.text, order=q.order)
        for q in sorted(job.questions, key=lambda q: q.order)
    ]

    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def generate_and_persist_questions(
    db: Session, candidate: Candidate, job: Job, count: int = 5
) -> InterviewSession:
    cv_text = candidate.cvs[-1].parsed_text if candidate.cvs else ""
    job_description = job.description if job else ""
    required_skills = _format_required_skills(job)

    session = InterviewSession(candidate_id=candidate.id, job_id=job.id, status="pending")
    questions = get_ai_provider().generate_questions(cv_text, job_description, required_skills, count=count)
    session.questions = [
        InterviewQuestion(
            text=q["question"], category=q.get("category"), difficulty=q.get("difficulty"), order=i
        )
        for i, q in enumerate(questions)
    ]

    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def _get_or_create_answer(db: Session, session_id: int, question_id: int) -> CandidateAnswer:
    answer = (
        db.query(CandidateAnswer)
        .filter(CandidateAnswer.session_id == session_id, CandidateAnswer.question_id == question_id)
        .first()
    )
    if answer is None:
        answer = CandidateAnswer(session_id=session_id, question_id=question_id)
        db.add(answer)
        db.flush()
    return answer


def _get_session_and_question(
    db: Session, session_id: int, question_id: int
) -> tuple[InterviewSession, InterviewQuestion]:
    session = db.get(InterviewSession, session_id)
    if session is None:
        raise ValueError("Interview session not found")
    question = db.get(InterviewQuestion, question_id)
    if question is None or question.session_id != session_id:
        raise ValueError("Question not found for this session")
    return session, question


def attach_media(
    db: Session,
    session_id: int,
    question_id: int,
    object_key: str,
    filename: str,
    content_type: str,
    size: int,
) -> CandidateAnswer:
    """Persist a successfully-uploaded recording's object-storage metadata
    onto its answer, creating the answer row if this is the first thing
    recorded for that question (before any transcript/evaluation exists).
    """
    _get_session_and_question(db, session_id, question_id)
    answer = _get_or_create_answer(db, session_id, question_id)
    answer.audio_path = object_key
    answer.media_filename = filename
    answer.media_content_type = content_type
    answer.media_size = size
    db.commit()
    db.refresh(answer)
    return answer


def attach_recording(
    db: Session, session_id: int, object_key: str, filename: str, content_type: str, size: int
) -> InterviewSession:
    """Persist the whole-interview recording's object-storage metadata onto
    its session — see POST /interviews/{id}/recording, called once at the
    end of the interview (as opposed to attach_media, which is per-answer
    and belongs to the now-superseded per-question recording flow).
    """
    session = db.get(InterviewSession, session_id)
    if session is None:
        raise ValueError("Interview session not found")
    session.recording_path = object_key
    session.recording_filename = filename
    session.recording_content_type = content_type
    session.recording_size = size
    db.commit()
    db.refresh(session)
    return session


def evaluate_answer(
    db: Session, session_id: int, question_id: int, candidate_answer: str
) -> tuple[AIEvaluation, InterviewQuestion | None]:
    session, question = _get_session_and_question(db, session_id, question_id)

    candidate = db.get(Candidate, session.candidate_id)
    job = db.get(Job, session.job_id)
    cv_text = candidate.cvs[-1].parsed_text if candidate and candidate.cvs else ""
    job_description = job.description if job else ""

    answer = _get_or_create_answer(db, session_id, question_id)
    answer.transcript = candidate_answer
    db.commit()
    db.refresh(answer)

    result = get_ai_provider().evaluate_and_adapt(
        job_description=job_description,
        cv_text=cv_text,
        previous_question=question.text,
        candidate_answer=candidate_answer,
    )

    evaluation = db.query(AIEvaluation).filter(AIEvaluation.answer_id == answer.id).first()
    if evaluation is None:
        evaluation = AIEvaluation(answer_id=answer.id)
        db.add(evaluation)
    evaluation.competency = result["competency"]
    evaluation.score = result["score"]
    evaluation.is_sufficient = result["is_sufficient"]
    evaluation.follow_up_needed = result["follow_up_needed"]
    evaluation.feedback = result["feedback"]

    existing_count = db.query(InterviewQuestion).filter(InterviewQuestion.session_id == session_id).count()
    next_question_text = result.get("next_question")
    next_question = None
    if next_question_text and existing_count < MAX_ADAPTIVE_QUESTIONS:
        next_question = InterviewQuestion(
            session_id=session_id,
            text=next_question_text,
            order=existing_count,
            is_follow_up=result["follow_up_needed"],
        )
        db.add(next_question)

    db.commit()
    db.refresh(evaluation)
    if next_question is not None:
        db.refresh(next_question)

    return evaluation, next_question


def get_session(db: Session, session_id: int) -> InterviewSession | None:
    return db.get(InterviewSession, session_id)


def list_sessions(
    db: Session, candidate_id: int | None = None, job_id: int | None = None
) -> list[InterviewSession]:
    query = db.query(InterviewSession)
    if candidate_id is not None:
        query = query.filter(InterviewSession.candidate_id == candidate_id)
    if job_id is not None:
        query = query.filter(InterviewSession.job_id == job_id)
    return query.all()


def attach_report_summary(db: Session, sessions: list[InterviewSession]) -> None:
    """Batch-attaches overall_score/recommendation from InterviewReport onto
    each session as transient attributes (not mapped columns), so HR-facing
    session responses can show a score without an N+1 report query per row.

    Deliberately not folded into get_session/list_sessions themselves —
    those are also called by finish/evaluate/generate-report/submit_answer,
    where this extra query would be pure overhead.
    """
    if not sessions:
        return
    reports = {
        report.session_id: report
        for report in db.query(InterviewReport).filter(
            InterviewReport.session_id.in_([s.id for s in sessions])
        )
    }
    for session in sessions:
        report = reports.get(session.id)
        session.overall_score = report.overall_score if report else None
        session.recommendation = report.recommendation if report else None
        session.hr_decision = report.hr_decision if report else None
        session.report_created_at = report.created_at if report else None


def attach_completion_stats(db: Session, sessions: list[InterviewSession]) -> None:
    """Transient duration_minutes/answered_count for the candidate's
    'completed interviews' list — derived from CandidateAnswer timestamps
    rather than InterviewSession.updated_at, which gets bumped again by a
    later HR evaluation (finalize_session/generate_final_report both write
    session.status) and would no longer reflect when the candidate actually
    finished. Not folded into get_session/list_sessions, same N+1-avoidance
    reason as attach_report_summary.
    """
    for session in sessions:
        session.answered_count = len([a for a in session.answers if a.transcript])
        if session.answers:
            last = max(a.created_at for a in session.answers)
            session.duration_minutes = max(round((last - session.created_at).total_seconds() / 60), 0)
        else:
            session.duration_minutes = None


def attach_violation_summary(db: Session, sessions: list[InterviewSession]) -> None:
    """Transient violation_counts (by type) for the HR review screen's
    Integrity card — see InterviewDetail.tsx. Not folded into
    get_session/list_sessions, same N+1-avoidance reason as
    attach_report_summary above.

    Also recomputes risk_score live from the same count whenever a stored
    snapshot exists, rather than trusting the value complete_session/
    terminate_session persisted at the time — the frontend's violation-log
    call is fire-and-forget (see Interview.tsx's logViolation), so a
    terminate request can reach the backend and snapshot the risk score
    before an in-flight violation POST has committed, undercounting it.
    Recomputing here is always correct because by the time anyone views the
    report, that request has long since landed.
    """
    if not sessions:
        return
    session_ids = [s.id for s in sessions]
    counts_by_session: dict[int, dict[str, int]] = {sid: {} for sid in session_ids}
    for violation in db.query(InterviewViolation).filter(InterviewViolation.session_id.in_(session_ids)):
        bucket = counts_by_session[violation.session_id]
        bucket[violation.violation_type] = bucket.get(violation.violation_type, 0) + 1
    for session in sessions:
        counts = counts_by_session.get(session.id, {})
        session.violation_counts = counts
        if session.risk_score is not None:
            session.risk_score = _risk_score_from_violation_count(sum(counts.values()))


def log_violation(db: Session, session: InterviewSession, violation_type: str) -> InterviewViolation:
    violation = InterviewViolation(session_id=session.id, violation_type=violation_type)
    db.add(violation)
    db.commit()
    db.refresh(violation)
    return violation


def _compute_risk_score(db: Session, session: InterviewSession) -> int:
    count = db.query(InterviewViolation).filter(InterviewViolation.session_id == session.id).count()
    return _risk_score_from_violation_count(count)


def update_session_status(
    db: Session, session: InterviewSession, data: InterviewSessionStatusUpdate
) -> InterviewSession:
    session.status = data.status
    db.commit()
    db.refresh(session)
    return session


def delete_session(db: Session, session: InterviewSession, storage: MediaStorage | None = None) -> None:
    answer_ids = [a.id for a in session.answers]
    if storage is not None:
        for answer in session.answers:
            if answer.audio_path:
                try:
                    storage.delete(answer.audio_path)
                except Exception:
                    pass  # best-effort — don't block session deletion on a storage hiccup
        if session.recording_path:
            try:
                storage.delete(session.recording_path)
            except Exception:
                pass
    if answer_ids:
        db.query(AIEvaluation).filter(AIEvaluation.answer_id.in_(answer_ids)).delete(
            synchronize_session=False
        )
    db.query(AIScore).filter(AIScore.session_id == session.id).delete()
    db.query(InterviewReport).filter(InterviewReport.session_id == session.id).delete()
    db.delete(session)
    db.commit()


def add_question(db: Session, session: InterviewSession, data: InterviewQuestionCreate) -> InterviewQuestion:
    question = InterviewQuestion(
        session_id=session.id, text=data.text, order=data.order, is_follow_up=data.is_follow_up
    )
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


def get_question(db: Session, session_id: int, question_id: int) -> InterviewQuestion | None:
    return (
        db.query(InterviewQuestion)
        .filter(InterviewQuestion.id == question_id, InterviewQuestion.session_id == session_id)
        .first()
    )


def get_answer(db: Session, session_id: int, question_id: int) -> CandidateAnswer | None:
    return (
        db.query(CandidateAnswer)
        .filter(CandidateAnswer.session_id == session_id, CandidateAnswer.question_id == question_id)
        .first()
    )


def update_question(db: Session, question: InterviewQuestion, data: InterviewQuestionUpdate) -> InterviewQuestion:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(question, field, value)
    db.commit()
    db.refresh(question)
    return question


def delete_question(db: Session, question: InterviewQuestion) -> None:
    db.delete(question)
    db.commit()


def submit_answer(db: Session, session_id: int, data: AnswerSubmit) -> CandidateAnswer:
    session = db.get(InterviewSession, session_id)
    if session is None:
        raise ValueError("Interview session not found")
    if session.status != "in_progress":
        raise ValueError("This interview is no longer active")

    transcript = data.transcript
    if transcript is None and data.audio_path:
        transcript = get_ai_provider().transcribe(data.audio_path)

    # A forced timeout submission is never blocked — the candidate simply
    # ran out of time, which isn't the same thing as submitting junk on
    # purpose. A blank answer isn't gibberish either, it's just absent.
    if transcript and transcript.strip() and not data.is_timeout:
        validate_answer_text(transcript.strip(), enforce_word_limit=data.answer_mode != "voice")

    # Reuses the existing row instead of inserting a new one: /ai/transcribe
    # may have already created this (session_id, question_id) answer via
    # attach_media() when the recording was made, before this call arrives.
    answer = _get_or_create_answer(db, session_id, data.question_id)
    answer.transcript = transcript
    if data.audio_path:
        answer.audio_path = data.audio_path
    answer.recording_start_offset_seconds = data.recording_start_offset_seconds
    answer.recording_end_offset_seconds = data.recording_end_offset_seconds
    db.commit()
    db.refresh(answer)
    return answer


def complete_session(db: Session, session: InterviewSession) -> InterviewSession:
    """Candidate-facing completion: just marks the interview as awaiting HR
    review. No AI call — evaluation is now HR-triggered (see finalize_session,
    called from the /evaluate endpoint once HR sees the session is ready).
    """
    if session.status != "in_progress":
        raise ValueError("This interview is no longer active")
    session.status = "awaiting_review"
    session.risk_score = _compute_risk_score(db, session)
    db.commit()
    db.refresh(session)
    return session


def terminate_session(db: Session, session: InterviewSession) -> InterviewSession:
    """The candidate switched tabs/apps a second time after being warned once
    (see frontend Interview.tsx's leave-tracking) — end the interview
    immediately as a distinct terminal state. Unlike complete_session, this
    is not a normal finish: create_session refuses new attempts once a
    candidate has a terminated session, so this is final.
    """
    if session.status != "in_progress":
        raise ValueError("Only an in-progress interview can be terminated")
    session.status = "terminated"
    session.risk_score = _compute_risk_score(db, session)
    db.commit()
    db.refresh(session)
    return session


def finalize_session(db: Session, session_id: int) -> InterviewReport:
    session = db.get(InterviewSession, session_id)
    if session is None:
        raise ValueError("Interview session not found")
    if session.status == "in_progress":
        raise ValueError("Candidate has not finished this interview yet")

    job = db.get(Job, session.job_id)
    provider = get_ai_provider()

    transcript = [
        {"question": a.question.text, "answer": a.transcript or ""} for a in session.answers
    ]
    report_data = provider.generate_report(transcript, job.description if job else "")

    scores = [
        provider.evaluate_answer(pair["question"], pair["answer"], job.description if job else "")
        for pair in transcript
    ]
    averaged = _average_scores(scores)

    # Upsert rather than always inserting — HR can re-trigger evaluation
    # (e.g. a double-click, or intentionally regenerating the report), and
    # this must not accumulate duplicate AIScore/InterviewReport rows.
    ai_score = db.query(AIScore).filter(AIScore.session_id == session_id).first()
    if ai_score is None:
        ai_score = AIScore(session_id=session_id)
        db.add(ai_score)
    for field, value in averaged.items():
        setattr(ai_score, field, value)

    report = db.query(InterviewReport).filter(InterviewReport.session_id == session_id).first()
    if report is None:
        report = InterviewReport(session_id=session_id)
        db.add(report)
    report.summary = report_data.get("summary")
    report.recommendation = _normalize_recommendation(report_data.get("recommendation"))

    session.status = "completed"

    try:
        db.commit()
    except IntegrityError:
        # Lost the race to a concurrent call that inserted its own report
        # for this session first (see interview_reports.session_id's unique
        # constraint) — discard this one and hand back the winner.
        db.rollback()
        winner = db.query(InterviewReport).filter(InterviewReport.session_id == session_id).first()
        if winner is None:
            raise
        session.status = "completed"
        db.commit()
        return winner
    db.refresh(report)
    return report


def get_score(db: Session, session_id: int) -> AIScore | None:
    return db.query(AIScore).filter(AIScore.session_id == session_id).first()


def update_score(db: Session, score: AIScore, data: AIScoreUpdate) -> AIScore:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(score, field, value)
    db.commit()
    db.refresh(score)
    return score


def get_report(db: Session, session_id: int) -> InterviewReport | None:
    return db.query(InterviewReport).filter(InterviewReport.session_id == session_id).first()


def update_report(db: Session, report: InterviewReport, data: InterviewReportUpdate) -> InterviewReport:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(report, field, value)
    db.commit()
    db.refresh(report)
    return report


def _average_scores(scores: list[dict]) -> dict:
    keys = [
        "technical_competency",
        "communication_skills",
        "problem_solving",
        "job_role_compatibility",
        "response_quality",
        "confidence",
    ]
    if not scores:
        return {key: None for key in keys} | {"overall_score": None}

    averaged = {key: sum(s.get(key, 0) or 0 for s in scores) / len(scores) for key in keys}
    averaged["overall_score"] = sum(averaged.values()) / len(keys)
    return averaged

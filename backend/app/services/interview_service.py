from sqlalchemy.orm import Session

from app.models.ai_score import AIScore, InterviewReport
from app.models.candidate import Candidate
from app.models.interview import CandidateAnswer, InterviewQuestion, InterviewSession
from app.models.job import Job
from app.schemas.interview import AnswerSubmit, InterviewSessionCreate
from app.services.ai import get_ai_provider


def create_session(db: Session, data: InterviewSessionCreate) -> InterviewSession:
    candidate = db.get(Candidate, data.candidate_id)
    job = db.get(Job, data.job_id)

    cv_text = candidate.cvs[-1].parsed_text if candidate and candidate.cvs else ""
    job_description = job.description if job else ""

    session = InterviewSession(candidate_id=data.candidate_id, job_id=data.job_id, status="in_progress")
    questions = get_ai_provider().generate_questions(cv_text, job_description)
    session.questions = [
        InterviewQuestion(text=text, order=i) for i, text in enumerate(questions)
    ]

    db.add(session)
    db.commit()
    db.refresh(session)
    return session


def get_session(db: Session, session_id: int) -> InterviewSession | None:
    return db.get(InterviewSession, session_id)


def submit_answer(db: Session, session_id: int, data: AnswerSubmit) -> CandidateAnswer:
    transcript = data.transcript
    if transcript is None and data.audio_path:
        transcript = get_ai_provider().transcribe(data.audio_path)

    answer = CandidateAnswer(
        session_id=session_id,
        question_id=data.question_id,
        transcript=transcript,
        audio_path=data.audio_path,
    )
    db.add(answer)
    db.commit()
    db.refresh(answer)
    return answer


def finalize_session(db: Session, session_id: int) -> InterviewReport:
    session = db.get(InterviewSession, session_id)
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

    ai_score = AIScore(session_id=session_id, **averaged)
    report = InterviewReport(
        session_id=session_id,
        summary=report_data.get("summary"),
        recommendation=report_data.get("recommendation"),
    )
    session.status = "completed"

    db.add_all([ai_score, report])
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

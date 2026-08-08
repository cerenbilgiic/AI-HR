from sqlalchemy.orm import Session

from app.models.ai_evaluation import AIEvaluation
from app.models.ai_score import AIScore, InterviewReport
from app.models.candidate import Candidate
from app.models.interview import CandidateAnswer, InterviewQuestion, InterviewSession
from app.models.job import Job
from app.schemas.interview import (
    AnswerSubmit,
    InterviewQuestionCreate,
    InterviewQuestionUpdate,
    InterviewSessionStatusUpdate,
)
from app.schemas.report import AIScoreUpdate, InterviewReportUpdate
from app.services.ai import get_ai_provider

MAX_ADAPTIVE_QUESTIONS = 8


def _format_required_skills(job: Job | None) -> str:
    if job is None or not job.skills:
        return ""
    return ", ".join(
        f"{skill.name} ({skill.required_level})" if skill.required_level else skill.name
        for skill in job.skills
    )


def create_session(db: Session, candidate: Candidate) -> InterviewSession:
    job = db.get(Job, candidate.job_id)

    cv_text = candidate.cvs[-1].parsed_text if candidate.cvs else ""
    job_description = job.description if job else ""
    required_skills = _format_required_skills(job)

    session = InterviewSession(candidate_id=candidate.id, job_id=candidate.job_id, status="in_progress")
    questions = get_ai_provider().generate_questions(cv_text, job_description, required_skills, count=1)
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


def preview_questions(db: Session, candidate: Candidate, count: int = 5) -> list[dict]:
    job = db.get(Job, candidate.job_id)
    cv_text = candidate.cvs[-1].parsed_text if candidate.cvs else ""
    job_description = job.description if job else ""
    required_skills = _format_required_skills(job)
    return get_ai_provider().generate_questions(cv_text, job_description, required_skills, count=count)


def evaluate_answer(
    db: Session, session_id: int, question_id: int, candidate_answer: str
) -> tuple[AIEvaluation, InterviewQuestion | None]:
    session = db.get(InterviewSession, session_id)
    if session is None:
        raise ValueError("Interview session not found")
    question = db.get(InterviewQuestion, question_id)
    if question is None or question.session_id != session_id:
        raise ValueError("Question not found for this session")

    candidate = db.get(Candidate, session.candidate_id)
    job = db.get(Job, session.job_id)
    cv_text = candidate.cvs[-1].parsed_text if candidate and candidate.cvs else ""
    job_description = job.description if job else ""

    answer = (
        db.query(CandidateAnswer)
        .filter(CandidateAnswer.session_id == session_id, CandidateAnswer.question_id == question_id)
        .first()
    )
    if answer is None:
        answer = CandidateAnswer(session_id=session_id, question_id=question_id, transcript=candidate_answer)
        db.add(answer)
    else:
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


def update_session_status(
    db: Session, session: InterviewSession, data: InterviewSessionStatusUpdate
) -> InterviewSession:
    session.status = data.status
    db.commit()
    db.refresh(session)
    return session


def delete_session(db: Session, session: InterviewSession) -> None:
    answer_ids = [a.id for a in session.answers]
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

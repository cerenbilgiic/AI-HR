from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog
from app.models.candidate import Candidate
from app.models.job import Job, JobQuestion, JobSkill
from app.models.job_transfer_request import JobTransferRequest
from app.models.user import Role, User
from app.schemas.job import JobCreate, JobQuestionIn, JobQuestionUpdate, JobSkillIn, JobSkillUpdate, JobUpdate


def list_jobs(db: Session, visible_to: User | None = None) -> list[Job]:
    """visible_to=None keeps the original unscoped list — Dashboard,
    InterviewList, CandidateWorkspace, Reports etc. all resolve job names
    for candidates/interviews regardless of who owns the job, so only the
    "İş İlanları" management page opts into per-owner scoping (via
    jobs.py's GET /jobs?scope=mine). Scoping mirrors transfer_job's
    authorization tiers: hr_manager sees their own + every "hr"-owned job
    (the accounts they manage), admin sees everything, plain hr sees only
    their own."""
    if visible_to is None:
        return db.query(Job).all()

    role = visible_to.role.name if visible_to.role else None
    if role == "admin":
        return db.query(Job).all()
    if role == "hr_manager":
        return (
            db.query(Job)
            .join(User, Job.created_by_id == User.id)
            .join(Role, User.role_id == Role.id)
            .filter((Job.created_by_id == visible_to.id) | (Role.name == "hr"))
            .all()
        )
    return db.query(Job).filter(Job.created_by_id == visible_to.id).all()


def get_job(db: Session, job_id: int) -> Job | None:
    return db.get(Job, job_id)


def create_job(db: Session, data: JobCreate, created_by_id: int) -> Job:
    job = Job(
        title=data.title,
        description=data.description,
        department=data.department,
        location=data.location,
        created_by_id=created_by_id,
        skills=[JobSkill(name=s.name, required_level=s.required_level) for s in data.skills],
        questions=[JobQuestion(text=q.text, order=q.order) for q in data.questions],
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job


def update_job(db: Session, job: Job, data: JobUpdate) -> Job:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(job, field, value)
    db.commit()
    db.refresh(job)
    return job


def delete_job(db: Session, job: Job) -> None:
    if db.query(Candidate).filter(Candidate.job_id == job.id).first() is not None:
        raise ValueError("Cannot delete a job that has candidates")
    db.delete(job)
    db.commit()


def add_job_skill(db: Session, job: Job, data: JobSkillIn) -> JobSkill:
    skill = JobSkill(job_id=job.id, name=data.name, required_level=data.required_level)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


def get_job_skill(db: Session, job_id: int, skill_id: int) -> JobSkill | None:
    return db.query(JobSkill).filter(JobSkill.id == skill_id, JobSkill.job_id == job_id).first()


def update_job_skill(db: Session, skill: JobSkill, data: JobSkillUpdate) -> JobSkill:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(skill, field, value)
    db.commit()
    db.refresh(skill)
    return skill


def delete_job_skill(db: Session, skill: JobSkill) -> None:
    db.delete(skill)
    db.commit()


def add_job_question(db: Session, job: Job, data: JobQuestionIn) -> JobQuestion:
    question = JobQuestion(job_id=job.id, text=data.text, order=data.order)
    db.add(question)
    db.commit()
    db.refresh(question)
    return question


def get_job_question(db: Session, job_id: int, question_id: int) -> JobQuestion | None:
    return db.query(JobQuestion).filter(JobQuestion.id == question_id, JobQuestion.job_id == job_id).first()


def update_job_question(db: Session, question: JobQuestion, data: JobQuestionUpdate) -> JobQuestion:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(question, field, value)
    db.commit()
    db.refresh(question)
    return question


def delete_job_question(db: Session, question: JobQuestion) -> None:
    db.delete(question)
    db.commit()


def request_job_transfer(db: Session, job: Job, to_user_id: int, requested_by: User) -> JobTransferRequest:
    """Creates a pending request — ownership only actually moves once the
    recipient approves via respond_to_transfer_request, regardless of
    whether requested_by is the current owner or an hr_manager acting on
    their behalf (see the router's authorization check)."""
    if to_user_id == job.created_by_id:
        raise ValueError("Bu ilan zaten bu kullanıcıya ait")
    existing = (
        db.query(JobTransferRequest)
        .filter(JobTransferRequest.job_id == job.id, JobTransferRequest.status == "pending")
        .first()
    )
    if existing is not None:
        raise ValueError("Bu ilan için zaten bekleyen bir devir talebi var")

    request = JobTransferRequest(
        job_id=job.id,
        from_user_id=job.created_by_id,
        to_user_id=to_user_id,
        requested_by_id=requested_by.id,
        status="pending",
    )
    db.add(request)
    db.add(
        AuditLog(
            actor_type="hr",
            actor_id=requested_by.id,
            action="job_transfer_requested",
            detail={"job_id": job.id, "from_user_id": job.created_by_id, "to_user_id": to_user_id},
        )
    )
    db.commit()
    db.refresh(request)
    return request


def respond_to_transfer_request(db: Session, request: JobTransferRequest, approve: bool, responder: User) -> JobTransferRequest:
    """Only the recipient (to_user_id) may call this — enforced by the
    router, not here. Approving is the only path that actually changes
    Job.created_by_id."""
    if request.status != "pending":
        raise ValueError("Bu talep zaten yanıtlanmış")

    request.status = "approved" if approve else "rejected"
    request.responded_at = datetime.now(timezone.utc)
    if approve:
        job = db.get(Job, request.job_id)
        job.created_by_id = request.to_user_id

    db.add(
        AuditLog(
            actor_type="hr",
            actor_id=responder.id,
            action="job_transfer_approved" if approve else "job_transfer_rejected",
            detail={"job_id": request.job_id, "from_user_id": request.from_user_id, "to_user_id": request.to_user_id},
        )
    )
    db.commit()
    db.refresh(request)
    return request


def list_transfer_requests(
    db: Session, *, to_user_id: int | None = None, requested_by_id: int | None = None
) -> list[JobTransferRequest]:
    query = db.query(JobTransferRequest)
    if to_user_id is not None:
        query = query.filter(JobTransferRequest.to_user_id == to_user_id, JobTransferRequest.status == "pending")
    if requested_by_id is not None:
        query = query.filter(JobTransferRequest.requested_by_id == requested_by_id)
    return query.order_by(JobTransferRequest.created_at.desc()).all()

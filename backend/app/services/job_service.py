from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.job import Job, JobQuestion, JobSkill
from app.schemas.job import JobCreate, JobQuestionIn, JobQuestionUpdate, JobSkillIn, JobSkillUpdate, JobUpdate


def list_jobs(db: Session) -> list[Job]:
    return db.query(Job).all()


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

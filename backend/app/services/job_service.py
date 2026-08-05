from sqlalchemy.orm import Session

from app.models.job import Job, JobSkill
from app.schemas.job import JobCreate


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
    )
    db.add(job)
    db.commit()
    db.refresh(job)
    return job

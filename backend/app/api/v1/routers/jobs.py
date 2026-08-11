from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.job import (
    JobCreate,
    JobOut,
    JobQuestionIn,
    JobQuestionOut,
    JobQuestionUpdate,
    JobSkillIn,
    JobSkillOut,
    JobSkillUpdate,
    JobUpdate,
)
from app.services import job_service

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=list[JobOut])
def list_jobs(db: Session = Depends(get_db)) -> list[JobOut]:
    return job_service.list_jobs(db)


@router.post("", response_model=JobOut, status_code=status.HTTP_201_CREATED)
def create_job(
    data: JobCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobOut:
    return job_service.create_job(db, data, created_by_id=current_user.id)


@router.get("/{job_id}", response_model=JobOut)
def get_job(job_id: int, db: Session = Depends(get_db)) -> JobOut:
    job = job_service.get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


def _get_job_or_404(db: Session, job_id: int):
    job = job_service.get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
    return job


@router.put("/{job_id}", response_model=JobOut)
def update_job(
    job_id: int,
    data: JobUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobOut:
    job = _get_job_or_404(db, job_id)
    return job_service.update_job(db, job, data)


@router.delete("/{job_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job(
    job_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> None:
    job = _get_job_or_404(db, job_id)
    try:
        job_service.delete_job(db, job)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/{job_id}/skills", response_model=JobSkillOut, status_code=status.HTTP_201_CREATED)
def add_job_skill(
    job_id: int,
    data: JobSkillIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobSkillOut:
    job = _get_job_or_404(db, job_id)
    return job_service.add_job_skill(db, job, data)


@router.put("/{job_id}/skills/{skill_id}", response_model=JobSkillOut)
def update_job_skill(
    job_id: int,
    skill_id: int,
    data: JobSkillUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobSkillOut:
    skill = job_service.get_job_skill(db, job_id, skill_id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
    return job_service.update_job_skill(db, skill, data)


@router.delete("/{job_id}/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job_skill(
    job_id: int,
    skill_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    skill = job_service.get_job_skill(db, job_id, skill_id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
    job_service.delete_job_skill(db, skill)


@router.post("/{job_id}/questions", response_model=JobQuestionOut, status_code=status.HTTP_201_CREATED)
def add_job_question(
    job_id: int,
    data: JobQuestionIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobQuestionOut:
    job = _get_job_or_404(db, job_id)
    return job_service.add_job_question(db, job, data)


@router.put("/{job_id}/questions/{question_id}", response_model=JobQuestionOut)
def update_job_question(
    job_id: int,
    question_id: int,
    data: JobQuestionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobQuestionOut:
    question = job_service.get_job_question(db, job_id, question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    return job_service.update_job_question(db, question, data)


@router.delete("/{job_id}/questions/{question_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_job_question(
    job_id: int,
    question_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    question = job_service.get_job_question(db, job_id, question_id)
    if question is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Question not found")
    job_service.delete_job_question(db, question)

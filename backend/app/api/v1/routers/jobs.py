from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_user, role_name
from app.core.database import get_db
from app.models.job_transfer_request import JobTransferRequest
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
from app.schemas.job_transfer import JobTransferRequestIn, JobTransferRequestOut, JobTransferRespond
from app.services import job_service, user_service

router = APIRouter(prefix="/jobs", tags=["jobs"])


@router.get("", response_model=list[JobOut])
def list_jobs(
    scope: str = "all",
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[JobOut]:
    """scope="mine" (used by pages/hr/JobPostings.tsx) applies the
    per-owner visibility tiers from job_service.list_jobs; the default
    "all" is unchanged so every other GET /jobs caller (Dashboard,
    InterviewList, CandidateWorkspace, Reports — all of which resolve job
    names for candidates/interviews regardless of owner) keeps working."""
    if scope == "mine":
        return job_service.list_jobs(db, visible_to=current_user)
    return job_service.list_jobs(db)


def _build_transfer_out(db: Session, request: JobTransferRequest) -> JobTransferRequestOut:
    job = job_service.get_job(db, request.job_id)
    user_ids = {uid for uid in (request.from_user_id, request.to_user_id, request.requested_by_id) if uid is not None}
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids))} if user_ids else {}
    return JobTransferRequestOut(
        id=request.id,
        job_id=request.job_id,
        job_title=job.title if job else "",
        from_user_id=request.from_user_id,
        from_user_name=users[request.from_user_id].full_name if request.from_user_id in users else None,
        to_user_id=request.to_user_id,
        to_user_name=users[request.to_user_id].full_name if request.to_user_id in users else None,
        requested_by_id=request.requested_by_id,
        requested_by_name=users[request.requested_by_id].full_name if request.requested_by_id in users else None,
        status=request.status,
        created_at=request.created_at,
        responded_at=request.responded_at,
    )


@router.get("/transfer-requests/incoming", response_model=list[JobTransferRequestOut])
def list_incoming_transfer_requests(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> list[JobTransferRequestOut]:
    requests = job_service.list_transfer_requests(db, to_user_id=current_user.id)
    return [_build_transfer_out(db, r) for r in requests]


@router.get("/transfer-requests/outgoing", response_model=list[JobTransferRequestOut])
def list_outgoing_transfer_requests(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> list[JobTransferRequestOut]:
    requests = job_service.list_transfer_requests(db, requested_by_id=current_user.id)
    return [_build_transfer_out(db, r) for r in requests]


@router.post("/transfer-requests/{request_id}/respond", response_model=JobTransferRequestOut)
def respond_to_transfer_request(
    request_id: int,
    data: JobTransferRespond,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobTransferRequestOut:
    request = db.get(JobTransferRequest, request_id)
    if request is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Transfer request not found")
    if request.to_user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu talebi yalnızca alıcı yanıtlayabilir.")
    try:
        request = job_service.respond_to_transfer_request(db, request, data.approve, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return _build_transfer_out(db, request)


@router.post("/{job_id}/transfer", response_model=JobTransferRequestOut, status_code=status.HTTP_201_CREATED)
def transfer_job(
    job_id: int,
    data: JobTransferRequestIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> JobTransferRequestOut:
    """Authorization mirrors users.py update_user's three-way check: the
    current owner transferring their own posting (self), an admin acting on
    anyone's posting, or an hr_manager acting on behalf of an "hr"-role
    owner they manage. In every case the transfer only completes once
    to_user_id approves — see respond_to_transfer_request."""
    job = job_service.get_job(db, job_id)
    if job is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")

    is_self = current_user.id == job.created_by_id
    is_admin = role_name(current_user) == "admin"
    is_manager_of_owner = role_name(current_user) == "hr_manager" and role_name(job.created_by) == "hr"
    if not is_self and not is_admin and not is_manager_of_owner:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu ilanı devretme yetkiniz yok.")

    to_user = user_service.get_user(db, data.to_user_id)
    if to_user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Recipient not found")

    try:
        request = job_service.request_job_transfer(db, job, data.to_user_id, current_user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    return _build_transfer_out(db, request)


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

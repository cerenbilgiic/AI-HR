from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_candidate, get_current_user
from app.core.database import get_db
from app.models.candidate import Candidate
from app.models.job import Job
from app.models.user import User
from app.schemas.candidate import (
    CandidateCreate,
    CandidateCVCreate,
    CandidateCVOut,
    CandidateCVUpdate,
    CandidateDetailOut,
    CandidateOut,
    CandidateSkillIn,
    CandidateSkillOut,
    CandidateSkillUpdate,
    CandidateUpdate,
    ConsentIn,
    ConsentOut,
)
from app.services import candidate_service
from app.services.docx_report import build_cv_analysis_docx

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.get("", response_model=list[CandidateOut])
def list_candidates(
    job_id: int | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[CandidateOut]:
    return candidate_service.list_candidates(db, job_id=job_id)


@router.post("", response_model=CandidateOut, status_code=status.HTTP_201_CREATED)
def create_candidate(data: CandidateCreate, db: Session = Depends(get_db)) -> CandidateOut:
    return candidate_service.create_candidate(db, data)


@router.get("/{candidate_id}", response_model=CandidateDetailOut)
def get_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateDetailOut:
    candidate = _get_candidate_or_404(db, candidate_id)
    return candidate


def _get_candidate_or_404(db: Session, candidate_id: int) -> Candidate:
    candidate = candidate_service.get_candidate(db, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    return candidate


@router.put("/{candidate_id}", response_model=CandidateOut)
def update_candidate(
    candidate_id: int,
    data: CandidateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateOut:
    candidate = _get_candidate_or_404(db, candidate_id)
    return candidate_service.update_candidate(db, candidate, data)


@router.delete("/{candidate_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    candidate = _get_candidate_or_404(db, candidate_id)
    try:
        candidate_service.delete_candidate(db, candidate)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc


@router.post("/{candidate_id}/consent", response_model=ConsentOut, status_code=status.HTTP_201_CREATED)
def submit_consent(
    candidate_id: int,
    data: ConsentIn,
    db: Session = Depends(get_db),
    current_candidate: Candidate = Depends(get_current_candidate),
) -> ConsentOut:
    if candidate_id != current_candidate.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized for this candidate")
    return candidate_service.record_consent(db, candidate_id, data)


@router.get("/{candidate_id}/consent", response_model=ConsentOut)
def get_consent(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> ConsentOut:
    consent = candidate_service.get_consent(db, candidate_id)
    if consent is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Consent record not found")
    return consent


@router.post("/{candidate_id}/skills", response_model=CandidateSkillOut, status_code=status.HTTP_201_CREATED)
def add_candidate_skill(
    candidate_id: int,
    data: CandidateSkillIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateSkillOut:
    candidate = _get_candidate_or_404(db, candidate_id)
    return candidate_service.add_candidate_skill(db, candidate, data)


@router.put("/{candidate_id}/skills/{skill_id}", response_model=CandidateSkillOut)
def update_candidate_skill(
    candidate_id: int,
    skill_id: int,
    data: CandidateSkillUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateSkillOut:
    skill = candidate_service.get_candidate_skill(db, candidate_id, skill_id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
    return candidate_service.update_candidate_skill(db, skill, data)


@router.delete("/{candidate_id}/skills/{skill_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_candidate_skill(
    candidate_id: int,
    skill_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    skill = candidate_service.get_candidate_skill(db, candidate_id, skill_id)
    if skill is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Skill not found")
    candidate_service.delete_candidate_skill(db, skill)


@router.post("/{candidate_id}/cvs", response_model=CandidateCVOut, status_code=status.HTTP_201_CREATED)
def add_candidate_cv(
    candidate_id: int,
    data: CandidateCVCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateCVOut:
    candidate = _get_candidate_or_404(db, candidate_id)
    return candidate_service.add_candidate_cv(db, candidate, data)


@router.put("/{candidate_id}/cvs/{cv_id}", response_model=CandidateCVOut)
def update_candidate_cv(
    candidate_id: int,
    cv_id: int,
    data: CandidateCVUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateCVOut:
    cv = candidate_service.get_candidate_cv(db, candidate_id, cv_id)
    if cv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV not found")
    return candidate_service.update_candidate_cv(db, cv, data)


@router.delete("/{candidate_id}/cvs/{cv_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_candidate_cv(
    candidate_id: int,
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    cv = candidate_service.get_candidate_cv(db, candidate_id, cv_id)
    if cv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV not found")
    candidate_service.delete_candidate_cv(db, cv)


@router.post("/{candidate_id}/cvs/{cv_id}/analysis", response_model=CandidateCVOut)
def analyze_candidate_cv(
    candidate_id: int,
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateCVOut:
    candidate = _get_candidate_or_404(db, candidate_id)
    cv = candidate_service.get_candidate_cv(db, candidate_id, cv_id)
    if cv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV not found")
    return candidate_service.analyze_candidate_cv(db, candidate, cv)


@router.get("/{candidate_id}/cvs/{cv_id}/analysis/docx")
def download_candidate_cv_analysis(
    candidate_id: int,
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> StreamingResponse:
    candidate = _get_candidate_or_404(db, candidate_id)
    cv = candidate_service.get_candidate_cv(db, candidate_id, cv_id)
    if cv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV not found")
    if not cv.analysis:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV has not been analyzed yet")

    job = db.get(Job, candidate.job_id)
    buffer = build_cv_analysis_docx(candidate, job, cv.analysis)
    filename = f"{candidate.full_name.replace(' ', '_')}_cv_analysis.docx"
    ascii_filename = filename.encode("ascii", "ignore").decode("ascii") or "cv_analysis.docx"
    encoded_filename = quote(filename)
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_filename}"; filename*=UTF-8\'\'{encoded_filename}'
            )
        },
    )

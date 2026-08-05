from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.schemas.candidate import CandidateCreate, CandidateOut, ConsentIn, ConsentOut
from app.services import candidate_service

router = APIRouter(prefix="/candidates", tags=["candidates"])


@router.get("", response_model=list[CandidateOut])
def list_candidates(job_id: int | None = None, db: Session = Depends(get_db)) -> list[CandidateOut]:
    return candidate_service.list_candidates(db, job_id=job_id)


@router.post("", response_model=CandidateOut, status_code=status.HTTP_201_CREATED)
def create_candidate(data: CandidateCreate, db: Session = Depends(get_db)) -> CandidateOut:
    return candidate_service.create_candidate(db, data)


@router.get("/{candidate_id}", response_model=CandidateOut)
def get_candidate(candidate_id: int, db: Session = Depends(get_db)) -> CandidateOut:
    candidate = candidate_service.get_candidate(db, candidate_id)
    if candidate is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")
    return candidate


@router.post("/{candidate_id}/consent", response_model=ConsentOut, status_code=status.HTTP_201_CREATED)
def submit_consent(candidate_id: int, data: ConsentIn, db: Session = Depends(get_db)) -> ConsentOut:
    return candidate_service.record_consent(db, candidate_id, data)

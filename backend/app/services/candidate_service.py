from sqlalchemy.orm import Session

from app.models.candidate import Candidate
from app.models.consent import ConsentRecord
from app.schemas.candidate import CandidateCreate, ConsentIn


def list_candidates(db: Session, job_id: int | None = None) -> list[Candidate]:
    query = db.query(Candidate)
    if job_id is not None:
        query = query.filter(Candidate.job_id == job_id)
    return query.all()


def get_candidate(db: Session, candidate_id: int) -> Candidate | None:
    return db.get(Candidate, candidate_id)


def create_candidate(db: Session, data: CandidateCreate) -> Candidate:
    candidate = Candidate(**data.model_dump())
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


def record_consent(db: Session, candidate_id: int, data: ConsentIn) -> ConsentRecord:
    consent = ConsentRecord(candidate_id=candidate_id, **data.model_dump())
    db.add(consent)
    db.commit()
    db.refresh(consent)
    return consent

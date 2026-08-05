from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.candidate import Candidate, CandidateCV, CandidateSkill
from app.models.consent import ConsentRecord
from app.models.interview import InterviewSession
from app.schemas.candidate import (
    CandidateCreate,
    CandidateCVCreate,
    CandidateCVUpdate,
    CandidateSkillIn,
    CandidateSkillUpdate,
    CandidateUpdate,
    ConsentIn,
)


def list_candidates(db: Session, job_id: int | None = None) -> list[Candidate]:
    query = db.query(Candidate)
    if job_id is not None:
        query = query.filter(Candidate.job_id == job_id)
    return query.all()


def get_candidate(db: Session, candidate_id: int) -> Candidate | None:
    return db.get(Candidate, candidate_id)


def create_candidate(db: Session, data: CandidateCreate) -> Candidate:
    candidate_data = data.model_dump(exclude={"password"})
    candidate = Candidate(**candidate_data, hashed_password=hash_password(data.password))
    db.add(candidate)
    db.commit()
    db.refresh(candidate)
    return candidate


def update_candidate(db: Session, candidate: Candidate, data: CandidateUpdate) -> Candidate:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(candidate, field, value)
    db.commit()
    db.refresh(candidate)
    return candidate


def delete_candidate(db: Session, candidate: Candidate) -> None:
    has_sessions = db.query(InterviewSession).filter(InterviewSession.candidate_id == candidate.id).first()
    has_consent = db.query(ConsentRecord).filter(ConsentRecord.candidate_id == candidate.id).first()
    if has_sessions is not None or has_consent is not None:
        raise ValueError("Cannot delete a candidate with interview sessions or consent records")
    db.delete(candidate)
    db.commit()


def record_consent(db: Session, candidate_id: int, data: ConsentIn) -> ConsentRecord:
    consent = ConsentRecord(candidate_id=candidate_id, **data.model_dump())
    db.add(consent)
    db.commit()
    db.refresh(consent)
    return consent


def get_consent(db: Session, candidate_id: int) -> ConsentRecord | None:
    return db.query(ConsentRecord).filter(ConsentRecord.candidate_id == candidate_id).first()


def add_candidate_skill(db: Session, candidate: Candidate, data: CandidateSkillIn) -> CandidateSkill:
    skill = CandidateSkill(candidate_id=candidate.id, name=data.name)
    db.add(skill)
    db.commit()
    db.refresh(skill)
    return skill


def get_candidate_skill(db: Session, candidate_id: int, skill_id: int) -> CandidateSkill | None:
    return (
        db.query(CandidateSkill)
        .filter(CandidateSkill.id == skill_id, CandidateSkill.candidate_id == candidate_id)
        .first()
    )


def update_candidate_skill(db: Session, skill: CandidateSkill, data: CandidateSkillUpdate) -> CandidateSkill:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(skill, field, value)
    db.commit()
    db.refresh(skill)
    return skill


def delete_candidate_skill(db: Session, skill: CandidateSkill) -> None:
    db.delete(skill)
    db.commit()


def add_candidate_cv(db: Session, candidate: Candidate, data: CandidateCVCreate) -> CandidateCV:
    cv = CandidateCV(candidate_id=candidate.id, file_path=data.file_path, parsed_text=data.parsed_text)
    db.add(cv)
    db.commit()
    db.refresh(cv)
    return cv


def get_candidate_cv(db: Session, candidate_id: int, cv_id: int) -> CandidateCV | None:
    return db.query(CandidateCV).filter(CandidateCV.id == cv_id, CandidateCV.candidate_id == candidate_id).first()


def update_candidate_cv(db: Session, cv: CandidateCV, data: CandidateCVUpdate) -> CandidateCV:
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(cv, field, value)
    db.commit()
    db.refresh(cv)
    return cv


def delete_candidate_cv(db: Session, cv: CandidateCV) -> None:
    db.delete(cv)
    db.commit()

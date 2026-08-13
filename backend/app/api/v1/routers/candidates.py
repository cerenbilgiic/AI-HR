import io
import uuid
from urllib.parse import quote

from fastapi import APIRouter, BackgroundTasks, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_candidate, get_current_user
from app.core.database import get_db
from app.models.candidate import Candidate
from app.models.job import Job
from app.models.user import User
from app.schemas.ai import AIMediaUrlResponse
from app.schemas.candidate import (
    CandidateCreate,
    CandidateCVCreate,
    CandidateCVOut,
    CandidateCVUpdate,
    CandidateDetailOut,
    CandidateOut,
    CandidateSelfUpdate,
    CandidateSkillIn,
    CandidateSkillOut,
    CandidateSkillUpdate,
    CandidateUpdate,
    ConsentIn,
    ConsentOut,
)
from app.schemas.invitation import CandidateImportSummary, InvitationOut
from app.services import candidate_import_service, candidate_service, invitation_service
from app.services.cv_text_extraction import extract_cv_text
from app.services.docx_report import build_cv_analysis_docx
from app.services.media_constraints import ALLOWED_CV_TYPES, MAX_CV_SIZE_BYTES
from app.services.storage import MediaStorage, get_media_storage

MEDIA_URL_EXPIRES_SECONDS = 300

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


@router.get("/me", response_model=CandidateDetailOut)
def get_my_candidate_profile(
    current_candidate: Candidate = Depends(get_current_candidate),
) -> CandidateDetailOut:
    """Candidate-only: lets the logged-in candidate see their own profile
    (job_id, interview_deadline) — see pages/candidate/CandidateHome.tsx and
    Interview.tsx's pre-start screen. Must stay registered before
    /{candidate_id} below, or FastAPI tries to parse "me" as an int.
    """
    current_candidate.interview_deadline = candidate_service.compute_interview_deadline(current_candidate)
    return current_candidate


@router.put("/me", response_model=CandidateDetailOut)
def update_my_candidate_profile(
    data: CandidateSelfUpdate,
    db: Session = Depends(get_db),
    current_candidate: Candidate = Depends(get_current_candidate),
) -> CandidateDetailOut:
    """Candidate-only self-service profile edit — see pages/candidate/MyProfile.tsx.
    Deliberately narrower than the HR-only PUT /candidates/{id}: only
    full_name/phone, no email (their login credential) or job_id.
    """
    updated = candidate_service.update_candidate(db, current_candidate, data)
    updated.interview_deadline = candidate_service.compute_interview_deadline(updated)
    return updated


@router.post("/me/cv", response_model=CandidateCVOut, status_code=status.HTTP_201_CREATED)
def upload_my_cv(
    background_tasks: BackgroundTasks,
    cv: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_candidate: Candidate = Depends(get_current_candidate),
    storage: MediaStorage = Depends(get_media_storage),
) -> CandidateCVOut:
    """Candidate-only self-service CV upload — see pages/candidate/MyProfile.tsx.
    Stores the file (same MediaStorage abstraction already used for interview
    recordings), extracts its text synchronously (fast, local, no AI), then
    schedules AI skill-extraction as a background task — that call can take
    well over a minute on a cold local model, so it must not block this
    response (see candidate_service.extract_and_merge_cv_skills). Structured
    CV analysis (strengths/weaknesses) stays the separate HR-triggered
    /cvs/{cv_id}/analysis flow.
    """
    content_type = (cv.content_type or "").split(";")[0].strip()
    extension = ALLOWED_CV_TYPES.get(content_type)
    if extension is None:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported file type: {content_type or 'unknown'}. Please upload a PDF or Word document.",
        )

    data = cv.file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    if len(data) > MAX_CV_SIZE_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {MAX_CV_SIZE_BYTES // (1024 * 1024)}MB limit",
        )

    object_key = f"cvs/{current_candidate.id}/{uuid.uuid4()}{extension}"
    try:
        storage.upload(object_key, io.BytesIO(data), content_type, len(data))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Could not upload CV: {exc}") from exc

    parsed_text = extract_cv_text(data, content_type)
    saved_cv = candidate_service.add_candidate_cv(
        db, current_candidate, CandidateCVCreate(file_path=object_key, parsed_text=parsed_text or None)
    )

    if parsed_text:
        background_tasks.add_task(candidate_service.extract_and_merge_cv_skills, current_candidate.id, saved_cv.id)

    return saved_cv


@router.get("/import/template")
def download_import_template(current_user: User = Depends(get_current_user)) -> StreamingResponse:
    buffer = candidate_import_service.build_template_xlsx()
    return StreamingResponse(
        buffer,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="aday_import_sablonu.xlsx"'},
    )


@router.post("/import", response_model=CandidateImportSummary)
def import_candidates(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateImportSummary:
    data = file.file.read()
    if not data:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Empty file")
    return candidate_import_service.parse_and_import(db, file.filename or "", data, actor_id=current_user.id)


@router.post("/invite-bulk", response_model=list[InvitationOut])
def invite_candidates_bulk(
    candidate_ids: list[int],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[InvitationOut]:
    results = []
    for candidate_id in candidate_ids:
        candidate = _get_candidate_or_404(db, candidate_id)
        issued = invitation_service.issue_credentials(db, candidate, actor_id=current_user.id)
        results.append(
            InvitationOut(candidate_id=candidate.id, login_email=issued.login_email, password=issued.password)
        )
    return results


@router.get("/{candidate_id}", response_model=CandidateDetailOut)
def get_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> CandidateDetailOut:
    candidate = _get_candidate_or_404(db, candidate_id)
    candidate.interview_deadline = candidate_service.compute_interview_deadline(candidate)
    return candidate


@router.post("/{candidate_id}/invite", response_model=InvitationOut)
def invite_candidate(
    candidate_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> InvitationOut:
    candidate = _get_candidate_or_404(db, candidate_id)
    issued = invitation_service.issue_credentials(db, candidate, actor_id=current_user.id)
    return InvitationOut(candidate_id=candidate.id, login_email=issued.login_email, password=issued.password)


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


@router.get("/{candidate_id}/cvs/{cv_id}/file-url", response_model=AIMediaUrlResponse)
def get_candidate_cv_file_url(
    candidate_id: int,
    cv_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
    storage: MediaStorage = Depends(get_media_storage),
) -> AIMediaUrlResponse:
    """HR-only: lets HR actually open/download a candidate's uploaded CV
    file — see pages/hr/CandidateDetail.tsx. Mirrors GET
    /interviews/{id}/recording-url; the returned URL is served by the
    existing generic GET /interviews/media/{object_key} streamer (also
    HR-only), same as interview recordings.
    """
    cv = candidate_service.get_candidate_cv(db, candidate_id, cv_id)
    if cv is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="CV not found")
    url = storage.presigned_url(cv.file_path, expires_seconds=MEDIA_URL_EXPIRES_SECONDS)
    return AIMediaUrlResponse(url=url, expires_in_seconds=MEDIA_URL_EXPIRES_SECONDS)


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

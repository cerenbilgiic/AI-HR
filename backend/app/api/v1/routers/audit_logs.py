from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_admin
from app.core.database import get_db
from app.models.audit_log import AuditLog
from app.models.candidate import Candidate
from app.models.user import User
from app.schemas.audit_log import AuditLogOut

router = APIRouter(prefix="/audit-logs", tags=["audit-logs"])


@router.get("", response_model=list[AuditLogOut])
def list_audit_logs(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_admin),
) -> list[AuditLogOut]:
    logs = db.query(AuditLog).order_by(AuditLog.created_at.desc()).all()
    if not logs:
        return []

    # Batch-loaded lookups instead of one query per row — same shape as
    # interview_service.attach_report_summary's session->report dict.
    actor_ids = {log.actor_id for log in logs if log.actor_id is not None}
    candidate_ids = {log.candidate_id for log in logs if log.candidate_id is not None}
    actors = {u.id: u for u in db.query(User).filter(User.id.in_(actor_ids))} if actor_ids else {}
    candidates = (
        {c.id: c for c in db.query(Candidate).filter(Candidate.id.in_(candidate_ids))}
        if candidate_ids
        else {}
    )

    result = []
    for log in logs:
        actor = actors.get(log.actor_id) if log.actor_id is not None else None
        candidate = candidates.get(log.candidate_id) if log.candidate_id is not None else None
        result.append(
            AuditLogOut(
                id=log.id,
                created_at=log.created_at,
                actor_type=log.actor_type,
                actor_name=actor.full_name if actor else None,
                candidate_name=candidate.full_name if candidate else None,
                action=log.action,
                detail=log.detail,
            )
        )
    return result

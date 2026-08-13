import re
import secrets
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.audit_log import AuditLog
from app.models.candidate import Candidate

LOGIN_EMAIL_DOMAIN = "aday.mulakat.internal"
_PASSWORD_ALPHABET = "abcdefghjkmnpqrstuvwxyzACDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O/1/l/I — avoids typos
_TURKISH_ASCII_MAP = str.maketrans("çğıöşüÇĞİÖŞÜ", "cgiosuCGIOSU")


@dataclass
class IssuedCredentials:
    login_email: str
    password: str


def _slugify_name(full_name: str) -> str:
    ascii_name = full_name.translate(_TURKISH_ASCII_MAP)
    slug = re.sub(r"[^a-zA-Z]+", ".", ascii_name).strip(".").lower()
    return slug or "aday"


def _generate_login_email(db: Session, full_name: str) -> str:
    base = _slugify_name(full_name)
    while True:
        candidate_email = f"{base}{secrets.randbelow(9000) + 1000}@{LOGIN_EMAIL_DOMAIN}"
        exists = db.query(Candidate).filter(Candidate.login_email == candidate_email).first()
        if exists is None:
            return candidate_email


def _generate_password() -> str:
    return "".join(secrets.choice(_PASSWORD_ALPHABET) for _ in range(10))


def issue_credentials(db: Session, candidate: Candidate, actor_id: int | None = None) -> IssuedCredentials:
    """Assigns (or re-generates) this candidate's system login — a
    login_email distinct from their real email (never used to log in, see
    Candidate.login_email) plus a fresh random password. The plaintext
    password is only ever available here, right after generation — it's
    hashed before being stored, so HR must copy it now (or hit "Yeniden
    Gönder" to issue a new one if it's lost). See
    pages/hr/CandidateList.tsx's "Daveti Gönder"/"Yeniden Gönder"."""
    is_resend = candidate.invited_at is not None

    if candidate.login_email is None:
        candidate.login_email = _generate_login_email(db, candidate.full_name)

    password = _generate_password()
    candidate.hashed_password = hash_password(password)
    candidate.invited_at = datetime.now(timezone.utc)

    db.add(
        AuditLog(
            actor_type="hr",
            actor_id=actor_id,
            candidate_id=candidate.id,
            action="credentials_reissued" if is_resend else "credentials_issued",
        )
    )
    db.commit()
    db.refresh(candidate)
    return IssuedCredentials(login_email=candidate.login_email, password=password)

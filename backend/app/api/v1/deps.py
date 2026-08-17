from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.candidate import Candidate
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
# tokenUrl is purely a Swagger-docs hint for the /docs "Authorize" form and
# has no runtime effect — candidates never have a password-flow login to
# point it at (their token comes from the emailed magic link, see
# invitation_service.send_interview_link), so this just points at the
# nearest real endpoint for docs purposes.
candidate_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


def get_current_user(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials"
    )
    try:
        payload = decode_access_token(token)
        user_id = payload.get("sub")
        if user_id is None or payload.get("type") != "staff":
            raise credentials_error
    except JWTError:
        raise credentials_error

    user = db.get(User, int(user_id))
    if user is None:
        raise credentials_error
    return user


def role_name(user: User) -> str | None:
    """Shared by users.py and jobs.py — both need "is this caller self /
    hr_manager-of-target / admin" checks for a target that may itself be a
    User (users.py) or a Job's owner (jobs.py's transfer endpoints)."""
    return user.role.name if user.role else None


def get_current_admin(current_user: User = Depends(get_current_user)) -> User:
    """Gate for true-admin-only screens (currently just the audit log) —
    "hr_manager" does not qualify here, see get_current_manager below."""
    if role_name(current_user) != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def get_current_manager(current_user: User = Depends(get_current_user)) -> User:
    """Gate for staff-management screens (the Employees list) — both
    "hr_manager" and "admin" qualify; a plain "hr" account does not."""
    if role_name(current_user) not in ("hr_manager", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu işlem için yönetici yetkisi gereklidir.")
    return current_user


def get_current_candidate(
    token: str = Depends(candidate_oauth2_scheme), db: Session = Depends(get_db)
) -> Candidate:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials"
    )
    try:
        payload = decode_access_token(token)
        candidate_id = payload.get("sub")
        if candidate_id is None or payload.get("type") != "candidate":
            raise credentials_error
    except JWTError:
        raise credentials_error

    candidate = db.get(Candidate, int(candidate_id))
    if candidate is None:
        raise credentials_error
    return candidate


def get_current_user_or_candidate(
    token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User | Candidate:
    """Accepts either an HR staff token or a candidate token.

    For endpoints usable both by HR (testing/manual triggers) and by a
    candidate acting on their own interview session — callers must still
    verify a returned Candidate actually owns the resource being accessed.
    """
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials"
    )
    try:
        payload = decode_access_token(token)
        subject_id = payload.get("sub")
        token_type = payload.get("type")
        if subject_id is None or token_type not in ("staff", "candidate"):
            raise credentials_error
    except JWTError:
        raise credentials_error

    if token_type == "staff":
        user = db.get(User, int(subject_id))
        if user is None:
            raise credentials_error
        return user

    candidate = db.get(Candidate, int(subject_id))
    if candidate is None:
        raise credentials_error
    return candidate

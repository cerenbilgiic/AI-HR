from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.candidate import Candidate
from app.models.user import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
candidate_oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/candidate-login")


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

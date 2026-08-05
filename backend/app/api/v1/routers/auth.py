from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.security import create_access_token, verify_password
from app.models.candidate import Candidate
from app.models.user import User
from app.schemas.auth import LoginRequest, Token

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=Token)
def login(data: LoginRequest, db: Session = Depends(get_db)) -> Token:
    user = db.query(User).filter(User.email == data.email).first()
    if not user or not verify_password(data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(subject=str(user.id), token_type="staff")
    return Token(access_token=token)


@router.post("/candidate-login", response_model=Token)
def candidate_login(data: LoginRequest, db: Session = Depends(get_db)) -> Token:
    candidate = db.query(Candidate).filter(Candidate.email == data.email).first()
    if not candidate or not candidate.hashed_password or not verify_password(data.password, candidate.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(subject=str(candidate.id), token_type="candidate")
    return Token(access_token=token, candidate_id=candidate.id)

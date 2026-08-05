from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.job import Job
from app.models.user import Role, User
from app.schemas.user import UserCreate, UserUpdate


def list_users(db: Session) -> list[User]:
    return db.query(User).all()


def get_user(db: Session, user_id: int) -> User | None:
    return db.get(User, user_id)


def _get_role_or_raise(db: Session, role_name: str) -> Role:
    role = db.query(Role).filter(Role.name == role_name).first()
    if role is None:
        raise ValueError(f"Role '{role_name}' does not exist")
    return role


def create_user(db: Session, data: UserCreate) -> User:
    role = _get_role_or_raise(db, data.role)
    user = User(
        email=data.email,
        full_name=data.full_name,
        hashed_password=hash_password(data.password),
        role_id=role.id,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def update_user(db: Session, user: User, data: UserUpdate) -> User:
    updates = data.model_dump(exclude_unset=True)

    if "role" in updates:
        role_name = updates.pop("role")
        user.role_id = _get_role_or_raise(db, role_name).id

    if "password" in updates:
        password = updates.pop("password")
        if password:
            user.hashed_password = hash_password(password)

    for field, value in updates.items():
        setattr(user, field, value)

    db.commit()
    db.refresh(user)
    return user


def delete_user(db: Session, user: User) -> None:
    if db.query(Job).filter(Job.created_by_id == user.id).first() is not None:
        raise ValueError("Cannot delete a user who has created job postings")
    db.delete(user)
    db.commit()

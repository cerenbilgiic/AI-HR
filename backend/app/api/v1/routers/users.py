from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.v1.deps import get_current_manager, get_current_user, role_name
from app.core.database import get_db
from app.models.user import User
from app.schemas.auth import UserOut
from app.schemas.user import UserCreate, UserUpdate
from app.services import user_service

router = APIRouter(prefix="/users", tags=["users"])


@router.get("", response_model=list[UserOut])
def list_users(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_manager)
) -> list[UserOut]:
    # An hr_manager only manages "hr" accounts — scope the list to what
    # they're actually allowed to touch, not every account in the system.
    role_filter = None if role_name(current_user) == "admin" else "hr"
    return user_service.list_users(db, role_name=role_filter)


@router.post("", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(
    data: UserCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_manager)
) -> UserOut:
    if role_name(current_user) != "admin" and data.role != "hr":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="İK Müdürü yalnızca çalışan (İK Yöneticisi) hesabı oluşturabilir.",
        )
    try:
        return user_service.create_user(db, data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/directory", response_model=list[UserOut])
def list_directory(
    db: Session = Depends(get_db), current_user: User = Depends(get_current_user)
) -> list[UserOut]:
    """Minimal id/name/role list, open to every authenticated staff member
    (unlike GET /users, the full management view) — picking a job-transfer
    recipient is a normal action for any role, not a management action.
    Must stay registered before /{user_id} below, same ordering rule as /me.
    """
    return user_service.list_users(db)


@router.get("/me", response_model=UserOut)
def get_my_profile(current_user: User = Depends(get_current_user)) -> UserOut:
    """HR-only self-service profile fetch — see pages/hr/Layout.tsx (sidebar
    name/avatar) and pages/hr/Profile.tsx. Must stay registered before
    /{user_id} below, or FastAPI tries to parse "me" as an int (same
    ordering rule as GET /candidates/me).
    """
    return current_user


@router.get("/{user_id}", response_model=UserOut)
def get_user(
    user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_manager)
) -> UserOut:
    user = user_service.get_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if role_name(current_user) != "admin" and role_name(user) != "hr":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu hesabı görüntüleme yetkiniz yok.")
    return user


@router.put("/{user_id}", response_model=UserOut)
def update_user(
    user_id: int,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UserOut:
    """Three allowed callers: the user editing their own record (self-
    service profile edit — see pages/hr/Profile.tsx, must keep working for
    every role), an admin managing anyone, or an hr_manager managing an
    "hr"-role account. Regardless of caller, a role *change* is admin-only —
    compared against the target's *current* role, not just "is the field
    present", since Employees.tsx's save button always includes `role` in
    the payload even when it's unchanged; a manager doing a harmless name
    edit on an hr-role account must not 403 just because the field was sent.
    """
    user = user_service.get_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    is_self = current_user.id == user_id
    is_admin = role_name(current_user) == "admin"
    is_manager_of_target = role_name(current_user) == "hr_manager" and role_name(user) == "hr"
    if not is_self and not is_admin and not is_manager_of_target:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu hesabı düzenleme yetkiniz yok.")
    if data.role is not None and data.role != role_name(user) and not is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only an admin can change roles")

    try:
        return user_service.update_user(db, user, data)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_manager)
) -> None:
    if user_id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot delete your own account")
    user = user_service.get_user(db, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    if role_name(current_user) != "admin" and role_name(user) != "hr":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Bu hesabı silme yetkiniz yok.")
    try:
        user_service.delete_user(db, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc

from app.core.security import create_access_token, hash_password
from app.models.user import Role, User


def _disposable_hr_user(db_session, email="disposable@retailco.example.com") -> User:
    role = db_session.query(Role).filter(Role.name == "hr").first()
    user = User(
        email=email,
        full_name="Silinecek Kullanıcı",
        hashed_password=hash_password("Password123!"),
        role_id=role.id,
    )
    db_session.add(user)
    db_session.commit()
    return user


def test_admin_can_list_users(client, as_admin):
    response = client.get("/api/v1/users")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_hr_role_cannot_list_users(client, as_hr):
    response = client.get("/api/v1/users")
    assert response.status_code == 403


def test_hr_role_cannot_get_another_user(client, as_hr, admin_user):
    response = client.get(f"/api/v1/users/{admin_user.id}")
    assert response.status_code == 403


def test_admin_can_create_user(client, as_admin):
    response = client.post(
        "/api/v1/users",
        json={
            "email": "new.hr@retailco.example.com",
            "full_name": "Yeni Çalışan",
            "password": "Password123!",
            "role": "hr",
        },
    )
    assert response.status_code == 201
    assert response.json()["role"] == "hr"


def test_hr_role_cannot_create_user(client, as_hr):
    response = client.post(
        "/api/v1/users",
        json={
            "email": "blocked@retailco.example.com",
            "full_name": "Blocked",
            "password": "Password123!",
            "role": "hr",
        },
    )
    assert response.status_code == 403


def test_admin_can_update_another_users_profile_and_role(client, as_admin, hr_user):
    response = client.put(
        f"/api/v1/users/{hr_user.id}",
        json={"full_name": "Güncellenmiş İsim", "role": "admin"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Güncellenmiş İsim"
    assert body["role"] == "admin"


def test_hr_role_can_edit_own_profile(client, as_hr, hr_user):
    """Regression: this is the exact call pages/hr/Profile.tsx's "Profili
    Düzenle" already makes for every non-admin HR user — must keep working."""
    response = client.put(
        f"/api/v1/users/{hr_user.id}",
        json={"full_name": "Kendi Yeni İsmim"},
    )
    assert response.status_code == 200
    assert response.json()["full_name"] == "Kendi Yeni İsmim"


def test_hr_role_cannot_change_own_role(client, as_hr, hr_user):
    response = client.put(f"/api/v1/users/{hr_user.id}", json={"role": "admin"})
    assert response.status_code == 403


def test_hr_role_cannot_edit_another_users_profile(client, as_hr, admin_user):
    response = client.put(f"/api/v1/users/{admin_user.id}", json={"full_name": "Hacked"})
    assert response.status_code == 403


def test_admin_can_delete_another_user(client, as_admin, db_session):
    from app.core.security import hash_password
    from app.models.user import Role, User

    role = db_session.query(Role).filter(Role.name == "hr").first()
    disposable = User(
        email="disposable@retailco.example.com",
        full_name="Silinecek Kullanıcı",
        hashed_password=hash_password("Password123!"),
        role_id=role.id,
    )
    db_session.add(disposable)
    db_session.commit()

    response = client.delete(f"/api/v1/users/{disposable.id}")
    assert response.status_code == 204


def test_admin_cannot_delete_own_account(client, as_admin, admin_user):
    response = client.delete(f"/api/v1/users/{admin_user.id}")
    assert response.status_code == 400


def test_hr_role_cannot_delete_a_user(client, as_hr, admin_user):
    response = client.delete(f"/api/v1/users/{admin_user.id}")
    assert response.status_code == 403


def test_users_endpoints_require_auth(client, candidate):
    token = create_access_token(subject=str(candidate.id), token_type="candidate")
    response = client.get("/api/v1/users", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401


# --- hr_manager: manages "hr" accounts, but not other managers/admins or the system ---


def test_manager_list_only_returns_hr_accounts(client, as_manager, admin_user, manager_user):
    body = client.get("/api/v1/users").json()
    roles = {u["role"] for u in body}
    assert roles == {"hr"}
    ids = {u["id"] for u in body}
    assert admin_user.id not in ids
    assert manager_user.id not in ids


def test_manager_can_create_hr_account(client, as_manager):
    response = client.post(
        "/api/v1/users",
        json={
            "email": "new.by.manager@retailco.example.com",
            "full_name": "Manager'ın Ekledi",
            "password": "Password123!",
            "role": "hr",
        },
    )
    assert response.status_code == 201


def test_manager_cannot_create_elevated_role_account(client, as_manager):
    response = client.post(
        "/api/v1/users",
        json={
            "email": "blocked.by.manager@retailco.example.com",
            "full_name": "Blocked",
            "password": "Password123!",
            "role": "admin",
        },
    )
    assert response.status_code == 403


def test_manager_can_edit_an_hr_users_profile(client, as_manager, hr_user):
    response = client.put(f"/api/v1/users/{hr_user.id}", json={"full_name": "Müdür Düzenledi"})
    assert response.status_code == 200
    assert response.json()["full_name"] == "Müdür Düzenledi"


def test_manager_edit_with_unchanged_role_field_does_not_403(client, as_manager, hr_user):
    """The exact scenario Employees.tsx's save button produces — it always
    sends `role` in the payload, even when it matches the current value."""
    response = client.put(
        f"/api/v1/users/{hr_user.id}",
        json={"full_name": "İsim Değişti", "role": "hr"},
    )
    assert response.status_code == 200
    assert response.json()["full_name"] == "İsim Değişti"
    assert response.json()["role"] == "hr"


def test_manager_cannot_actually_change_a_role(client, as_manager, hr_user):
    response = client.put(f"/api/v1/users/{hr_user.id}", json={"role": "hr_manager"})
    assert response.status_code == 403


def test_manager_cannot_edit_another_manager_or_admin(client, as_manager, admin_user):
    response = client.put(f"/api/v1/users/{admin_user.id}", json={"full_name": "Hacked"})
    assert response.status_code == 403


def test_manager_can_edit_own_profile(client, as_manager, manager_user):
    response = client.put(f"/api/v1/users/{manager_user.id}", json={"full_name": "Kendimi Güncelledim"})
    assert response.status_code == 200


def test_manager_can_delete_an_hr_account(client, as_manager, db_session):
    disposable = _disposable_hr_user(db_session, email="disposable.manager@retailco.example.com")
    response = client.delete(f"/api/v1/users/{disposable.id}")
    assert response.status_code == 204


def test_manager_cannot_delete_another_manager_or_admin(client, as_manager, admin_user):
    response = client.delete(f"/api/v1/users/{admin_user.id}")
    assert response.status_code == 403

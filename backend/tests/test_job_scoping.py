from app.core.security import hash_password
from app.models.job import Job
from app.models.user import Role, User


def _hr_user(db_session, email: str, full_name: str = "Test Kullanıcı") -> User:
    role = db_session.query(Role).filter(Role.name == "hr").first()
    user = User(email=email, full_name=full_name, hashed_password=hash_password("Password123!"), role_id=role.id)
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


def _job_for(db_session, owner: User, title: str = "Test Pozisyonu") -> Job:
    job = Job(title=title, description="Test açıklaması", created_by_id=owner.id)
    db_session.add(job)
    db_session.commit()
    db_session.refresh(job)
    return job


def test_default_scope_is_unfiltered(client, as_hr, hr_user, admin_user, db_session):
    """Regression: Dashboard/InterviewList/CandidateWorkspace/Reports all
    call plain GET /jobs to resolve job names for candidates/interviews
    they don't own — must keep seeing everything."""
    other_owner_job = _job_for(db_session, admin_user)
    response = client.get("/api/v1/jobs")
    assert response.status_code == 200
    ids = {j["id"] for j in response.json()}
    assert other_owner_job.id in ids


def test_mine_scope_hr_sees_only_own_jobs(client, as_hr, hr_user, admin_user, db_session):
    own_job = _job_for(db_session, hr_user)
    other_job = _job_for(db_session, admin_user)

    response = client.get("/api/v1/jobs", params={"scope": "mine"})
    ids = {j["id"] for j in response.json()}
    assert own_job.id in ids
    assert other_job.id not in ids


def test_mine_scope_manager_sees_own_and_hr_owned_jobs_but_not_other_managers(
    client, as_manager, manager_user, hr_user, admin_user, db_session
):
    own_job = _job_for(db_session, manager_user)
    hr_owned_job = _job_for(db_session, hr_user)
    admin_job = _job_for(db_session, admin_user)

    response = client.get("/api/v1/jobs", params={"scope": "mine"})
    ids = {j["id"] for j in response.json()}
    assert own_job.id in ids
    assert hr_owned_job.id in ids
    assert admin_job.id not in ids


def test_mine_scope_admin_sees_everything(client, as_admin, hr_user, manager_user, db_session):
    hr_job = _job_for(db_session, hr_user)
    manager_job = _job_for(db_session, manager_user)

    response = client.get("/api/v1/jobs", params={"scope": "mine"})
    ids = {j["id"] for j in response.json()}
    assert hr_job.id in ids
    assert manager_job.id in ids

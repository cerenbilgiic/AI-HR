import io

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session as SASession

from app.api.v1.deps import get_current_candidate, get_current_user, get_current_user_or_candidate
from app.core.database import engine, get_db
from app.main import app
from app.models.candidate import Candidate
from app.models.interview import InterviewQuestion, InterviewSession
from app.models.job import Job
from app.models.user import Role, User
from app.services.storage import MediaStorage, get_media_storage


class FakeMediaStorage(MediaStorage):
    """In-memory stand-in for MinIO, so tests never touch a real bucket."""

    def __init__(self) -> None:
        self.objects: dict[str, bytes] = {}
        self.deleted: list[str] = []
        self.fail_upload = False

    def upload(self, object_key: str, data: io.BytesIO, content_type: str, size: int) -> None:
        if self.fail_upload:
            raise RuntimeError("simulated MinIO connection failure")
        self.objects[object_key] = data.read()

    def delete(self, object_key: str) -> None:
        self.deleted.append(object_key)
        self.objects.pop(object_key, None)

    def presigned_url(self, object_key: str, expires_seconds: int = 300) -> str:
        return f"http://fake-minio.local/{object_key}?expires={expires_seconds}"

    def download_to_path(self, object_key: str, dest_path: str) -> None:
        with open(dest_path, "wb") as f:
            f.write(self.objects[object_key])


@pytest.fixture()
def db_session():
    """Each test runs inside its own transaction, rolled back afterward —
    so tests can freely write rows without touching the real seeded data.
    """
    connection = engine.connect()
    transaction = connection.begin()
    # join_transaction_mode="create_savepoint" makes session.commit() inside
    # the code under test only release a SAVEPOINT, not the outer connection
    # transaction — otherwise a commit() in a service function would end the
    # transaction this fixture rolls back, breaking test isolation.
    session = SASession(bind=connection, join_transaction_mode="create_savepoint")
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def fake_storage():
    return FakeMediaStorage()


@pytest.fixture()
def client(db_session, fake_storage):
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_media_storage] = lambda: fake_storage
    yield TestClient(app)
    app.dependency_overrides.clear()


@pytest.fixture()
def hr_user(db_session) -> User:
    user = db_session.query(User).first()
    assert user is not None, "expected at least one seeded HR user"
    return user


@pytest.fixture()
def admin_user(db_session) -> User:
    user = db_session.query(User).join(Role).filter(Role.name == "admin").first()
    assert user is not None, "expected at least one seeded admin user"
    return user


@pytest.fixture()
def manager_user(db_session) -> User:
    user = db_session.query(User).join(Role).filter(Role.name == "hr_manager").first()
    assert user is not None, "expected at least one seeded hr_manager user"
    return user


@pytest.fixture()
def job(db_session) -> Job:
    job = db_session.query(Job).first()
    assert job is not None, "expected at least one seeded job"
    return job


@pytest.fixture()
def candidate(db_session, job) -> Candidate:
    candidate = db_session.query(Candidate).filter(Candidate.job_id == job.id).first()
    assert candidate is not None, "expected at least one seeded candidate"
    return candidate


@pytest.fixture()
def other_candidate(db_session, candidate) -> Candidate:
    other = db_session.query(Candidate).filter(Candidate.id != candidate.id).first()
    assert other is not None, "expected a second seeded candidate"
    return other


@pytest.fixture()
def interview_session(db_session, candidate, job) -> InterviewSession:
    session = InterviewSession(candidate_id=candidate.id, job_id=job.id, status="in_progress")
    session.questions = [InterviewQuestion(text="Test question?", order=0)]
    db_session.add(session)
    db_session.commit()
    db_session.refresh(session)
    return session


@pytest.fixture()
def question(interview_session) -> InterviewQuestion:
    return interview_session.questions[0]


def override_auth(principal: User | Candidate) -> None:
    app.dependency_overrides[get_current_user] = lambda: principal
    app.dependency_overrides[get_current_user_or_candidate] = lambda: principal
    if isinstance(principal, Candidate):
        app.dependency_overrides[get_current_candidate] = lambda: principal


@pytest.fixture()
def as_candidate(client, candidate):
    override_auth(candidate)
    yield candidate


@pytest.fixture()
def as_other_candidate(client, other_candidate):
    override_auth(other_candidate)
    yield other_candidate


@pytest.fixture()
def as_hr(client, hr_user):
    override_auth(hr_user)
    yield hr_user


@pytest.fixture()
def as_admin(client, admin_user):
    override_auth(admin_user)
    yield admin_user


@pytest.fixture()
def as_manager(client, manager_user):
    override_auth(manager_user)
    yield manager_user

from app.core.security import hash_password
from app.main import app
from app.api.v1.deps import get_current_user
from app.models.job import Job
from app.models.user import Role, User
from app.services import user_service


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


def _act_as(user: User) -> None:
    app.dependency_overrides[get_current_user] = lambda: user


def test_owner_can_request_transfer_but_ownership_unchanged_until_approval(client, as_hr, hr_user, db_session):
    recipient = _hr_user(db_session, "recipient1@retailco.example.com")
    job = _job_for(db_session, hr_user)

    response = client.post(f"/api/v1/jobs/{job.id}/transfer", json={"to_user_id": recipient.id})
    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "pending"

    db_session.refresh(job)
    assert job.created_by_id == hr_user.id  # unchanged until recipient approves


def test_recipient_approval_completes_the_transfer(client, as_hr, hr_user, db_session):
    recipient = _hr_user(db_session, "recipient2@retailco.example.com")
    job = _job_for(db_session, hr_user)

    request_id = client.post(f"/api/v1/jobs/{job.id}/transfer", json={"to_user_id": recipient.id}).json()["id"]

    _act_as(recipient)
    response = client.post(f"/api/v1/jobs/transfer-requests/{request_id}/respond", json={"approve": True})
    assert response.status_code == 200
    assert response.json()["status"] == "approved"

    db_session.refresh(job)
    assert job.created_by_id == recipient.id


def test_recipient_rejection_leaves_ownership_unchanged(client, as_hr, hr_user, db_session):
    recipient = _hr_user(db_session, "recipient3@retailco.example.com")
    job = _job_for(db_session, hr_user)

    request_id = client.post(f"/api/v1/jobs/{job.id}/transfer", json={"to_user_id": recipient.id}).json()["id"]

    _act_as(recipient)
    response = client.post(f"/api/v1/jobs/transfer-requests/{request_id}/respond", json={"approve": False})
    assert response.status_code == 200
    assert response.json()["status"] == "rejected"

    db_session.refresh(job)
    assert job.created_by_id == hr_user.id


def test_manager_can_initiate_transfer_on_behalf_of_an_hr_owner(client, as_manager, db_session):
    owner = _hr_user(db_session, "owner1@retailco.example.com")
    recipient = _hr_user(db_session, "recipient4@retailco.example.com")
    job = _job_for(db_session, owner)

    response = client.post(f"/api/v1/jobs/{job.id}/transfer", json={"to_user_id": recipient.id})
    assert response.status_code == 201
    assert response.json()["status"] == "pending"

    db_session.refresh(job)
    assert job.created_by_id == owner.id  # manager initiating does not bypass approval

    _act_as(recipient)
    request_id = response.json()["id"]
    approve_response = client.post(f"/api/v1/jobs/transfer-requests/{request_id}/respond", json={"approve": True})
    assert approve_response.status_code == 200

    db_session.refresh(job)
    assert job.created_by_id == recipient.id


def test_manager_cannot_transfer_a_job_owned_by_another_manager_or_admin(client, as_manager, admin_user, db_session):
    job = _job_for(db_session, admin_user)
    recipient = _hr_user(db_session, "recipient5@retailco.example.com")

    response = client.post(f"/api/v1/jobs/{job.id}/transfer", json={"to_user_id": recipient.id})
    assert response.status_code == 403


def test_plain_hr_cannot_initiate_someone_elses_transfer(client, as_hr, db_session):
    other_owner = _hr_user(db_session, "owner2@retailco.example.com")
    recipient = _hr_user(db_session, "recipient6@retailco.example.com")
    job = _job_for(db_session, other_owner)

    response = client.post(f"/api/v1/jobs/{job.id}/transfer", json={"to_user_id": recipient.id})
    assert response.status_code == 403


def test_only_the_recipient_can_respond_to_a_transfer_request(client, as_hr, hr_user, db_session):
    recipient = _hr_user(db_session, "recipient7@retailco.example.com")
    bystander = _hr_user(db_session, "bystander1@retailco.example.com")
    job = _job_for(db_session, hr_user)

    request_id = client.post(f"/api/v1/jobs/{job.id}/transfer", json={"to_user_id": recipient.id}).json()["id"]

    _act_as(bystander)
    response = client.post(f"/api/v1/jobs/transfer-requests/{request_id}/respond", json={"approve": True})
    assert response.status_code == 403


def test_second_pending_request_for_same_job_is_rejected(client, as_hr, hr_user, db_session):
    recipient_a = _hr_user(db_session, "recipient8@retailco.example.com")
    recipient_b = _hr_user(db_session, "recipient9@retailco.example.com")
    job = _job_for(db_session, hr_user)

    first = client.post(f"/api/v1/jobs/{job.id}/transfer", json={"to_user_id": recipient_a.id})
    assert first.status_code == 201

    second = client.post(f"/api/v1/jobs/{job.id}/transfer", json={"to_user_id": recipient_b.id})
    assert second.status_code == 409


def test_approved_transfer_unblocks_deleting_the_original_owner(client, db_session):
    recipient = _hr_user(db_session, "recipient10@retailco.example.com")
    # A fresh disposable owner (not the shared hr_user fixture) whose only
    # job is the one created below — so after the transfer they have zero
    # remaining jobs and delete_user's guard should pass.
    owner = _hr_user(db_session, "owner3@retailco.example.com")
    job = _job_for(db_session, owner)

    _act_as(owner)
    request_id = client.post(f"/api/v1/jobs/{job.id}/transfer", json={"to_user_id": recipient.id}).json()["id"]
    _act_as(recipient)
    client.post(f"/api/v1/jobs/transfer-requests/{request_id}/respond", json={"approve": True})

    user_service.delete_user(db_session, owner)  # no longer raises: owner has no jobs left
    assert db_session.get(User, owner.id) is None

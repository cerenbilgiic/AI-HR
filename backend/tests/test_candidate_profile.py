def test_candidate_can_fetch_own_profile(client, as_candidate, candidate, job):
    response = client.get("/api/v1/candidates/me")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == candidate.id
    assert body["job_id"] == job.id


def test_candidate_me_requires_candidate_token(client, as_hr):
    # HR's staff token isn't a candidate token — get_current_candidate
    # should reject it, same as any other candidate-only endpoint.
    response = client.get("/api/v1/candidates/me")
    assert response.status_code == 401


def test_candidate_can_update_own_full_name_and_phone(client, as_candidate, candidate):
    response = client.put("/api/v1/candidates/me", json={"full_name": "Updated Name", "phone": "+90 555 000 0000"})

    assert response.status_code == 200
    body = response.json()
    assert body["full_name"] == "Updated Name"
    assert body["phone"] == "+90 555 000 0000"


def test_candidate_self_update_cannot_change_email_or_job(client, as_candidate, candidate, db_session):
    original_email = candidate.email
    original_job_id = candidate.job_id

    response = client.put(
        "/api/v1/candidates/me",
        json={"full_name": "Still Me", "email": "hacked@example.com", "job_id": 999999},
    )

    assert response.status_code == 200
    db_session.refresh(candidate)
    assert candidate.email == original_email
    assert candidate.job_id == original_job_id


def test_candidate_self_update_requires_candidate_token(client, as_hr):
    response = client.put("/api/v1/candidates/me", json={"full_name": "Nope"})
    assert response.status_code == 401

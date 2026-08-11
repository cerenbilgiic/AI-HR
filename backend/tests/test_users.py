def test_get_my_profile_returns_authenticated_user(client, as_hr, hr_user):
    response = client.get("/api/v1/users/me")

    assert response.status_code == 200
    body = response.json()
    assert body["id"] == hr_user.id
    assert body["email"] == hr_user.email
    assert body["full_name"] == hr_user.full_name
    assert body["role"] == "hr"


def test_get_my_profile_requires_auth(client):
    response = client.get("/api/v1/users/me")

    assert response.status_code == 401

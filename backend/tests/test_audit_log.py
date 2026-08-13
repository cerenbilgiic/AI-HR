from app.core.security import create_access_token
from app.models.audit_log import AuditLog


def test_list_audit_logs_resolves_actor_and_candidate_names(client, as_admin, db_session, hr_user, candidate):
    # The dev DB this suite runs against already has real audit history from
    # manual testing (invites/imports actually performed) — db_session's
    # per-test transaction only isolates what *this* test adds, so assertions
    # below key off these specific new rows by id rather than assuming the
    # table starts empty. The logged action's actor is a regular "hr" role
    # staff member (hr_user) — anyone can trigger an invite/import, only
    # *viewing* the log itself is admin-gated.
    with_candidate = AuditLog(
        actor_type="hr",
        actor_id=hr_user.id,
        candidate_id=candidate.id,
        action="credentials_issued",
    )
    import_log = AuditLog(
        actor_type="hr",
        actor_id=hr_user.id,
        action="candidates_imported",
        detail={"created": 3, "errors": 1, "duplicates": 0},
    )
    db_session.add_all([with_candidate, import_log])
    db_session.commit()

    body = client.get("/api/v1/audit-logs").json()
    by_id = {e["id"]: e for e in body}

    by_candidate = by_id[with_candidate.id]
    assert by_candidate["action"] == "credentials_issued"
    assert by_candidate["actor_name"] == hr_user.full_name
    assert by_candidate["candidate_name"] == candidate.full_name

    import_entry = by_id[import_log.id]
    assert import_entry["actor_name"] == hr_user.full_name
    assert import_entry["candidate_name"] is None
    assert import_entry["detail"] == {"created": 3, "errors": 1, "duplicates": 0}


def test_list_audit_logs_sorted_newest_first(client, as_admin, db_session, hr_user):
    first = AuditLog(actor_type="hr", actor_id=hr_user.id, action="candidates_imported")
    db_session.add(first)
    db_session.commit()
    second = AuditLog(actor_type="hr", actor_id=hr_user.id, action="candidates_imported")
    db_session.add(second)
    db_session.commit()

    ids = [e["id"] for e in client.get("/api/v1/audit-logs").json()]

    assert ids.index(second.id) < ids.index(first.id)


def test_list_audit_logs_is_well_formed(client, as_admin):
    response = client.get("/api/v1/audit-logs")
    assert response.status_code == 200
    assert isinstance(response.json(), list)


def test_audit_logs_rejects_regular_hr_role(client, as_hr):
    """Regular HR staff can authenticate app-wide but this specific screen
    is admin-only — see get_current_admin."""
    response = client.get("/api/v1/audit-logs")
    assert response.status_code == 403


def test_audit_logs_rejects_hr_manager_role(client, as_manager):
    """hr_manager manages "hr" accounts (see test_user_management.py) but,
    per the 3-tier design, does not see the audit log — that stays
    strictly admin-only."""
    response = client.get("/api/v1/audit-logs")
    assert response.status_code == 403


def test_audit_logs_requires_auth(client, candidate):
    token = create_access_token(subject=str(candidate.id), token_type="candidate")
    response = client.get("/api/v1/audit-logs", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401

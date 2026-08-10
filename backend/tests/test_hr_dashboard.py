from app.core.security import create_access_token
from app.models.ai_score import InterviewReport
from app.models.candidate import CandidateCV, CandidateSkill


def test_get_session_accessible_by_hr(client, as_hr, interview_session):
    response = client.get(f"/api/v1/interviews/{interview_session.id}")
    assert response.status_code == 200
    assert response.json()["id"] == interview_session.id


def test_get_session_owning_candidate_can_access(client, as_candidate, interview_session):
    response = client.get(f"/api/v1/interviews/{interview_session.id}")
    assert response.status_code == 200


def test_get_session_other_candidate_forbidden(client, as_other_candidate, interview_session):
    response = client.get(f"/api/v1/interviews/{interview_session.id}")
    assert response.status_code == 403


def test_get_session_includes_created_and_updated_timestamps(client, as_hr, interview_session):
    body = client.get(f"/api/v1/interviews/{interview_session.id}").json()
    assert body["created_at"] is not None
    assert body["updated_at"] is not None


def test_get_session_includes_report_summary_when_present(
    client, as_hr, db_session, interview_session
):
    db_session.add(
        InterviewReport(session_id=interview_session.id, overall_score=77, recommendation="recommended")
    )
    db_session.commit()

    body = client.get(f"/api/v1/interviews/{interview_session.id}").json()

    assert body["overall_score"] == 77
    assert body["recommendation"] == "recommended"


def test_get_session_report_summary_null_when_absent(client, as_hr, interview_session):
    body = client.get(f"/api/v1/interviews/{interview_session.id}").json()
    assert body["overall_score"] is None
    assert body["recommendation"] is None


def test_list_sessions_includes_report_summary(client, as_hr, db_session, interview_session):
    db_session.add(
        InterviewReport(session_id=interview_session.id, overall_score=60, recommendation="maybe")
    )
    db_session.commit()

    body = client.get("/api/v1/interviews", params={"candidate_id": interview_session.candidate_id}).json()

    matching = next(s for s in body if s["id"] == interview_session.id)
    assert matching["overall_score"] == 60
    assert matching["recommendation"] == "maybe"


def test_question_includes_nested_answer_and_evaluation(
    client, as_hr, db_session, interview_session, question
):
    from app.models.ai_evaluation import AIEvaluation
    from app.models.interview import CandidateAnswer

    answer = CandidateAnswer(session_id=interview_session.id, question_id=question.id, transcript="my answer")
    db_session.add(answer)
    db_session.commit()
    db_session.add(
        AIEvaluation(answer_id=answer.id, competency="communication", score=7, feedback="Clear answer.")
    )
    db_session.commit()

    body = client.get(f"/api/v1/interviews/{interview_session.id}").json()

    q = body["questions"][0]
    assert q["answer"]["transcript"] == "my answer"
    assert q["answer"]["evaluation"]["competency"] == "communication"
    assert q["answer"]["evaluation"]["score"] == 7


def test_question_answer_null_when_unanswered(client, as_hr, interview_session):
    body = client.get(f"/api/v1/interviews/{interview_session.id}").json()
    assert body["questions"][0]["answer"] is None


def test_get_candidate_detail_includes_cvs_and_skills(client, as_hr, db_session, candidate):
    db_session.add(CandidateCV(candidate_id=candidate.id, file_path="cv.pdf", parsed_text="Experienced retail associate."))
    db_session.add(CandidateSkill(candidate_id=candidate.id, name="Customer service"))
    db_session.commit()

    body = client.get(f"/api/v1/candidates/{candidate.id}").json()

    assert any(cv["parsed_text"] == "Experienced retail associate." for cv in body["cvs"])
    assert any(skill["name"] == "Customer service" for skill in body["skills"])


def test_candidate_list_stays_lean_without_cv_field(client, as_hr, candidate):
    body = client.get("/api/v1/candidates").json()
    assert "cvs" not in body[0]


def test_hr_endpoints_reject_candidate_token(client, candidate):
    # Real JWT decoding path (not the dependency-override fixtures, which
    # bypass get_current_user's own type check) — a genuine candidate token
    # must not pass get_current_user's "type == staff" check.
    token = create_access_token(subject=str(candidate.id), token_type="candidate")
    response = client.get("/api/v1/candidates", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401

from datetime import datetime

from app.models.job import JobQuestion
from tests.conftest import clear_candidate_sessions


def test_add_job_question(client, as_hr, job):
    response = client.post(f"/api/v1/jobs/{job.id}/questions", json={"text": "Tell me about yourself.", "order": 0})

    assert response.status_code == 201
    body = response.json()
    assert body["text"] == "Tell me about yourself."
    assert body["order"] == 0


def test_job_out_includes_questions(client, as_hr, db_session, job):
    db_session.add(JobQuestion(job_id=job.id, text="Existing question?", order=0))
    db_session.commit()

    response = client.get(f"/api/v1/jobs/{job.id}")

    assert response.status_code == 200
    texts = [q["text"] for q in response.json()["questions"]]
    assert "Existing question?" in texts


def test_update_job_question(client, as_hr, db_session, job):
    question = JobQuestion(job_id=job.id, text="Original text", order=0)
    db_session.add(question)
    db_session.commit()

    response = client.put(
        f"/api/v1/jobs/{job.id}/questions/{question.id}", json={"text": "Updated text"}
    )

    assert response.status_code == 200
    assert response.json()["text"] == "Updated text"


def test_delete_job_question(client, as_hr, db_session, job):
    question = JobQuestion(job_id=job.id, text="To be deleted", order=0)
    db_session.add(question)
    db_session.commit()
    question_id = question.id

    response = client.delete(f"/api/v1/jobs/{job.id}/questions/{question_id}")

    assert response.status_code == 204
    assert db_session.query(JobQuestion).filter(JobQuestion.id == question_id).count() == 0


def test_update_nonexistent_question_returns_404(client, as_hr, job):
    response = client.put(f"/api/v1/jobs/{job.id}/questions/999999", json={"text": "x"})
    assert response.status_code == 404


def test_delete_nonexistent_question_returns_404(client, as_hr, job):
    response = client.delete(f"/api/v1/jobs/{job.id}/questions/999999")
    assert response.status_code == 404


def test_create_interview_session_end_to_end_uses_job_questions(
    client, as_candidate, db_session, candidate, job
):
    # Seeded candidates are intentionally backdated (for realistic dashboard
    # stats) and can already be past the interview deadline — reset it here
    # since this test isn't about deadlines.
    candidate.created_at = datetime.now()
    clear_candidate_sessions(db_session, candidate.id)

    # Seeded jobs already have their own real HR-authored questions — clear
    # them so this test only sees the two it's adding itself.
    db_session.query(JobQuestion).filter(JobQuestion.job_id == job.id).delete()
    db_session.add_all(
        [
            JobQuestion(job_id=job.id, text="Q1?", order=0),
            JobQuestion(job_id=job.id, text="Q2?", order=1),
        ]
    )
    db_session.commit()
    db_session.refresh(candidate)

    response = client.post("/api/v1/interviews")

    assert response.status_code == 201
    texts = [q["text"] for q in response.json()["questions"]]
    assert texts == ["Q1?", "Q2?"]


def test_create_interview_session_rejects_job_with_no_questions(client, as_candidate, db_session, job):
    db_session.query(JobQuestion).filter(JobQuestion.job_id == job.id).delete()
    db_session.commit()

    response = client.post("/api/v1/interviews")

    assert response.status_code == 409

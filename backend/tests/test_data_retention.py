from datetime import UTC, datetime, timedelta

from app.models.ai_score import AIScore, InterviewReport
from app.models.interview import CandidateAnswer
from app.services import data_retention


def _backdate(db_session, model, id_, days):
    db_session.query(model).filter(model.id == id_).update(
        {"created_at": datetime.now(UTC) - timedelta(days=days)}
    )
    db_session.commit()


def test_clear_expired_transcripts_purges_old_but_keeps_recent(
    db_session, interview_session, question
):
    old_answer = CandidateAnswer(
        session_id=interview_session.id, question_id=question.id, transcript="old answer text"
    )
    db_session.add(old_answer)
    db_session.commit()
    _backdate(db_session, CandidateAnswer, old_answer.id, days=40)

    cleared = data_retention.clear_expired_transcripts(db_session, older_than_days=30)

    assert cleared == 1
    db_session.refresh(old_answer)
    assert old_answer.transcript is None


def test_clear_expired_transcripts_keeps_recent_ones(db_session, interview_session, question):
    recent_answer = CandidateAnswer(
        session_id=interview_session.id, question_id=question.id, transcript="fresh answer"
    )
    db_session.add(recent_answer)
    db_session.commit()

    cleared = data_retention.clear_expired_transcripts(db_session, older_than_days=30)

    assert cleared == 0
    db_session.refresh(recent_answer)
    assert recent_answer.transcript == "fresh answer"


def test_delete_expired_reports(db_session, interview_session):
    old_report = InterviewReport(
        session_id=interview_session.id, summary="old summary", recommendation="Consider"
    )
    old_score = AIScore(session_id=interview_session.id, overall_score=7.5)
    db_session.add_all([old_report, old_score])
    db_session.commit()
    report_id, score_id = old_report.id, old_score.id
    _backdate(db_session, InterviewReport, report_id, days=100)
    _backdate(db_session, AIScore, score_id, days=100)

    deleted = data_retention.delete_expired_reports(db_session, older_than_days=90)

    assert deleted == 1
    assert db_session.query(InterviewReport).filter(InterviewReport.id == report_id).count() == 0
    assert db_session.query(AIScore).filter(AIScore.id == score_id).count() == 0


def test_delete_expired_reports_keeps_recent(db_session, interview_session):
    report = InterviewReport(session_id=interview_session.id, summary="recent", recommendation="Recommend")
    db_session.add(report)
    db_session.commit()

    deleted = data_retention.delete_expired_reports(db_session, older_than_days=90)

    assert deleted == 0
    assert db_session.get(InterviewReport, report.id) is not None


def test_run_retention_sweep_applies_each_window_independently(
    db_session, fake_storage, interview_session, question
):
    # 10 days old: past the 7-day media window, still under the 30-day
    # transcript window -> media purged, transcript survives.
    answer = CandidateAnswer(
        session_id=interview_session.id,
        question_id=question.id,
        transcript="keep this text",
        audio_path="interviews/1/clip.webm",
        media_filename="clip.webm",
        media_content_type="video/webm",
        media_size=100,
    )
    db_session.add(answer)
    db_session.commit()
    _backdate(db_session, CandidateAnswer, answer.id, days=10)
    fake_storage.objects["interviews/1/clip.webm"] = b"x"

    # 100 days old report -> past the 90-day report window.
    report = InterviewReport(session_id=interview_session.id, summary="s", recommendation="Consider")
    db_session.add(report)
    db_session.commit()
    report_id = report.id
    _backdate(db_session, InterviewReport, report_id, days=100)

    result = data_retention.run_retention_sweep(db_session, fake_storage)

    # The dev DB this suite runs against can already carry other real,
    # genuinely-stale media from manual testing (same caveat as
    # test_audit_log.py's audit-log count) — media_deleted only asserts
    # "at least this test's own row", the other two windows have no such
    # pre-existing rows so stay exact.
    assert result["media_deleted"] >= 1
    assert result["transcripts_cleared"] == 0
    assert result["reports_deleted"] == 1
    db_session.refresh(answer)
    assert answer.audio_path is None
    assert answer.transcript == "keep this text"
    assert db_session.query(InterviewReport).filter(InterviewReport.id == report_id).count() == 0

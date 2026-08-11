import os
import subprocess
import wave
from unittest.mock import MagicMock

import imageio_ffmpeg
import pytest

from app.models.interview import CandidateAnswer
from app.services import transcription_service
from app.services.audio_slicing import extract_audio_slice


def _generate_silent_wav(path: str, duration: float = 5.0) -> None:
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    subprocess.run(
        [ffmpeg_exe, "-y", "-f", "lavfi", "-i", "anullsrc=r=16000:cl=mono", "-t", str(duration), path],
        capture_output=True,
        check=True,
    )


# --- audio_slicing.py: real ffmpeg, no mocking (validates the mechanism) ---


def test_extract_audio_slice_produces_correctly_timed_file(tmp_path):
    source = str(tmp_path / "source.wav")
    _generate_silent_wav(source, duration=6.0)
    dest = str(tmp_path / "slice.wav")

    extract_audio_slice(source, start_seconds=1.0, end_seconds=3.0, dest_path=dest)

    assert os.path.exists(dest)
    assert os.path.getsize(dest) > 0
    with wave.open(dest, "rb") as w:
        duration = w.getnframes() / w.getframerate()
    assert 1.5 < duration < 2.5


def test_extract_audio_slice_raises_on_invalid_source(tmp_path):
    with pytest.raises(RuntimeError):
        extract_audio_slice(str(tmp_path / "does-not-exist.webm"), 0, 1, str(tmp_path / "out.wav"))


# --- transcription_service.py: mocked slicing/STT, real DB ---


def test_transcribe_session_answers_fills_blank_transcript(
    db_session, interview_session, question, fake_storage, mocker
):
    answer = CandidateAnswer(
        session_id=interview_session.id,
        question_id=question.id,
        transcript=None,
        recording_start_offset_seconds=1.0,
        recording_end_offset_seconds=3.0,
    )
    db_session.add(answer)
    interview_session.recording_path = "interviews/1/full-recording.webm"
    db_session.commit()
    fake_storage.objects["interviews/1/full-recording.webm"] = b"fake video bytes"

    mocker.patch("app.services.transcription_service.get_media_storage", return_value=fake_storage)
    mocker.patch("app.services.transcription_service.extract_audio_slice")
    fake_provider = MagicMock()
    fake_provider.transcribe.return_value = "merhaba bu benim cevabim"
    mocker.patch("app.services.transcription_service.get_ai_provider", return_value=fake_provider)

    transcription_service._transcribe_session_answers(db_session, interview_session)

    db_session.refresh(answer)
    assert answer.transcript == "merhaba bu benim cevabim"


def test_transcribe_session_answers_skips_existing_transcript(
    db_session, interview_session, question, fake_storage, mocker
):
    answer = CandidateAnswer(
        session_id=interview_session.id,
        question_id=question.id,
        transcript="I already typed this",
        recording_start_offset_seconds=1.0,
        recording_end_offset_seconds=3.0,
    )
    db_session.add(answer)
    interview_session.recording_path = "interviews/1/full-recording.webm"
    db_session.commit()
    fake_storage.objects["interviews/1/full-recording.webm"] = b"fake video bytes"

    mocker.patch("app.services.transcription_service.get_media_storage", return_value=fake_storage)
    slice_mock = mocker.patch("app.services.transcription_service.extract_audio_slice")
    fake_provider = MagicMock()
    mocker.patch("app.services.transcription_service.get_ai_provider", return_value=fake_provider)

    transcription_service._transcribe_session_answers(db_session, interview_session)

    db_session.refresh(answer)
    assert answer.transcript == "I already typed this"
    slice_mock.assert_not_called()
    fake_provider.transcribe.assert_not_called()


def test_transcribe_session_answers_skips_answer_without_offsets(
    db_session, interview_session, question, fake_storage, mocker
):
    answer = CandidateAnswer(session_id=interview_session.id, question_id=question.id, transcript=None)
    db_session.add(answer)
    interview_session.recording_path = "interviews/1/full-recording.webm"
    db_session.commit()
    fake_storage.objects["interviews/1/full-recording.webm"] = b"fake video bytes"

    mocker.patch("app.services.transcription_service.get_media_storage", return_value=fake_storage)
    slice_mock = mocker.patch("app.services.transcription_service.extract_audio_slice")

    transcription_service._transcribe_session_answers(db_session, interview_session)

    db_session.refresh(answer)
    assert answer.transcript is None
    slice_mock.assert_not_called()


def test_transcribe_session_answers_noop_when_no_recording(db_session, interview_session, question):
    answer = CandidateAnswer(
        session_id=interview_session.id,
        question_id=question.id,
        transcript=None,
        recording_start_offset_seconds=1.0,
        recording_end_offset_seconds=3.0,
    )
    db_session.add(answer)
    db_session.commit()

    transcription_service._transcribe_session_answers(db_session, interview_session)

    db_session.refresh(answer)
    assert answer.transcript is None


# --- API level: offsets persisted, /finish schedules the background task ---


def test_submit_answer_persists_recording_offsets(client, as_candidate, interview_session, question, db_session):
    response = client.post(
        f"/api/v1/interviews/{interview_session.id}/answers",
        json={
            "question_id": question.id,
            "transcript": None,
            "is_timeout": True,
            "recording_start_offset_seconds": 12.5,
            "recording_end_offset_seconds": 45.0,
        },
    )

    assert response.status_code == 201
    answer = (
        db_session.query(CandidateAnswer)
        .filter(CandidateAnswer.session_id == interview_session.id, CandidateAnswer.question_id == question.id)
        .first()
    )
    assert answer.recording_start_offset_seconds == 12.5
    assert answer.recording_end_offset_seconds == 45.0


def test_finish_schedules_transcription_background_task(client, as_candidate, interview_session, mocker):
    mock_transcribe = mocker.patch("app.api.v1.routers.interviews.transcribe_pending_answers")

    response = client.post(f"/api/v1/interviews/{interview_session.id}/finish")

    assert response.status_code == 200
    mock_transcribe.assert_called_once_with(interview_session.id)

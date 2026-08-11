# Recorded interview media (per-question, via /ai/transcribe, and the
# whole-interview recording via /interviews/{id}/recording) arrives as a
# single MediaRecorder blob — these are the mime types that combination can
# actually produce/be re-encoded as, plus a couple of common audio-only
# fallbacks.
ALLOWED_MEDIA_TYPES = {
    "video/webm": ".webm",
    "audio/webm": ".webm",
    "video/mp4": ".mp4",
    "audio/mp4": ".m4a",
    "audio/wav": ".wav",
    "audio/x-wav": ".wav",
    "audio/mpeg": ".mp3",
}
MAX_MEDIA_SIZE_BYTES = 100 * 1024 * 1024  # 100MB

# Candidate-uploaded CV files (POST /candidates/me/cv) — just the common
# resume document formats, not video/audio like the interview media above.
ALLOWED_CV_TYPES = {
    "application/pdf": ".pdf",
    "application/msword": ".doc",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}
MAX_CV_SIZE_BYTES = 10 * 1024 * 1024  # 10MB

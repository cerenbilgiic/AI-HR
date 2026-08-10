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

from faster_whisper import WhisperModel

from app.core.config import settings


class LocalWhisperSTT:
    def __init__(self, model_size: str | None = None, device: str | None = None) -> None:
        self._model_size = model_size or settings.whisper_model
        self._device = device or settings.whisper_device
        self._model: WhisperModel | None = None

    def _get_model(self) -> WhisperModel:
        if self._model is None:
            compute_type = "float16" if self._device == "cuda" else "int8"
            self._model = WhisperModel(
                self._model_size, device=self._device, compute_type=compute_type
            )
        return self._model

    def transcribe(self, audio_path: str) -> str:
        segments, _ = self._get_model().transcribe(audio_path)
        return " ".join(segment.text.strip() for segment in segments)

import os

from faster_whisper import WhisperModel

from app.core.config import settings


def _register_cuda_dll_dirs() -> None:
    """ctranslate2 delay-loads cuBLAS/cuDNN by name on Windows. The pip-installed
    nvidia-cublas-cu12/nvidia-cudnn-cu12 wheels put those DLLs under site-packages,
    which isn't on PATH by default, so the load silently fails at transcribe time
    (not at model-construction time) unless we add it ourselves first.
    """
    try:
        import nvidia.cublas
        import nvidia.cudnn
    except ImportError:
        return
    path = os.environ.get("PATH", "")
    for pkg in (nvidia.cublas, nvidia.cudnn):
        pkg_dir = next(iter(pkg.__path__), None)
        if pkg_dir is None:
            continue
        bin_dir = os.path.join(pkg_dir, "bin")
        if os.path.isdir(bin_dir) and bin_dir not in path:
            path = bin_dir + os.pathsep + path
    os.environ["PATH"] = path


class LocalWhisperSTT:
    def __init__(
        self, model_size: str | None = None, device: str | None = None, language: str | None = None
    ) -> None:
        self._model_size = model_size or settings.whisper_model
        self._device = device or settings.whisper_device
        self._language = language or settings.whisper_language
        self._model: WhisperModel | None = None
        if self._device == "cuda":
            _register_cuda_dll_dirs()

    def _get_model(self) -> WhisperModel:
        if self._model is None:
            compute_type = "float16" if self._device == "cuda" else "int8"
            self._model = WhisperModel(
                self._model_size, device=self._device, compute_type=compute_type
            )
        return self._model

    def transcribe(self, audio_path: str) -> str:
        # vad_filter drops silence/non-speech before it reaches the model, and
        # condition_on_previous_text=False stops one hallucinated segment from
        # biasing the next — small Whisper models otherwise tend to loop on
        # repeated garbage (e.g. strings of numbers) when fed quiet/noisy audio.
        # Pinning `language` also skips Whisper's own auto-detection, which was
        # misidentifying Turkish answers as another language entirely.
        try:
            segments, _ = self._get_model().transcribe(
                audio_path,
                language=self._language,
                vad_filter=True,
                condition_on_previous_text=False,
            )
            return " ".join(segment.text.strip() for segment in segments)
        except ValueError:
            # VAD found no speech at all in the audio (e.g. silence-only
            # recording) — faster-whisper's language-detection step throws
            # rather than returning an empty result in that case.
            return ""

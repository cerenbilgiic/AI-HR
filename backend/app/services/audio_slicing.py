import subprocess

import imageio_ffmpeg


def extract_audio_slice(source_path: str, start_seconds: float, end_seconds: float, dest_path: str) -> None:
    """Extracts [start_seconds, end_seconds) from source_path's audio track
    into a 16kHz mono WAV at dest_path — the shape LocalWhisperSTT.transcribe
    already expects. Uses imageio_ffmpeg's pip-installed static ffmpeg binary
    (no manual PATH setup), same "no manual environment setup" precedent as
    the CUDA DLL handling in local_stt.py.
    """
    duration = max(end_seconds - start_seconds, 0.1)
    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    result = subprocess.run(
        [
            ffmpeg_exe,
            "-y",
            "-ss", str(max(start_seconds, 0)),
            "-i", source_path,
            "-t", str(duration),
            "-vn",
            "-ar", "16000",
            "-ac", "1",
            dest_path,
        ],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg failed to extract audio slice: {result.stderr[-500:]}")

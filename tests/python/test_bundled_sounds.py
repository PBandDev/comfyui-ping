import hashlib
import wave
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
SOUNDS_DIR = REPO_ROOT / "sounds" / "bundled"


def wav_peak_amplitude(path: Path) -> int:
    with wave.open(str(path), "rb") as wav_file:
        frames = wav_file.readframes(wav_file.getnframes())
        sample_width = wav_file.getsampwidth()
        if sample_width != 2:
            msg = f"Unsupported sample width for {path.name}: {sample_width}"
            raise AssertionError(msg)

        peak = 0
        for index in range(0, len(frames), sample_width):
            sample = int.from_bytes(
                frames[index : index + sample_width],
                byteorder="little",
                signed=True,
            )
            peak = max(peak, abs(sample))

        return peak


def file_sha256(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def test_bundled_sounds_are_audible_and_distinct():
    success_path = SOUNDS_DIR / "ping-success.wav"
    failure_path = SOUNDS_DIR / "ping-failure.wav"

    assert success_path.is_file()
    assert failure_path.is_file()
    assert wav_peak_amplitude(success_path) > 0
    assert wav_peak_amplitude(failure_path) > 0
    assert file_sha256(success_path) != file_sha256(failure_path)

import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from comfyui_ping.sounds import (
    ALLOWED_EXTENSIONS,
    is_allowed_upload,
    list_available_sounds,
)


def test_list_sounds_returns_flat_entries():
    sounds = list_available_sounds(["ping-success.wav", "my.wav"])

    assert sounds == [
        {"name": "ping-success.wav"},
        {"name": "my.wav"},
    ]


def test_rejects_non_audio_extension():
    assert is_allowed_upload("not-a-sound.txt") is False


def test_accepts_expected_audio_extensions():
    assert ".wav" in ALLOWED_EXTENSIONS
    assert is_allowed_upload("ping-success.wav") is True
    assert is_allowed_upload("failure.ogg") is True


def test_bundled_sound_files_exist():
    assert (REPO_ROOT / "sounds" / "ping-success.wav").exists()
    assert (REPO_ROOT / "sounds" / "ping-failure.wav").exists()
    assert (REPO_ROOT / "sounds" / "ping-ringtone.wav").exists()
    assert (REPO_ROOT / "sounds" / "notification-soft.wav").exists()
    assert (REPO_ROOT / "sounds" / "beep-ping.wav").exists()
    assert (REPO_ROOT / "sounds" / "harmonic-beep.wav").exists()


def test_catalog_preserves_duplicate_names():
    sounds = list_available_sounds(["ping-success.wav", "ping-success.wav"])

    assert sounds == [
        {"name": "ping-success.wav"},
        {"name": "ping-success.wav"},
    ]

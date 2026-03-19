import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from comfyui_ping.sounds import (
    ALLOWED_EXTENSIONS,
    is_allowed_upload,
    list_available_sounds,
)


def test_list_sounds_returns_bundled_and_custom_entries():
    sounds = list_available_sounds(
        bundled=["ping-success.wav"],
        custom=["my.wav"],
    )

    assert sounds == [
        {"name": "ping-success.wav", "source": "bundled"},
        {"name": "my.wav", "source": "custom"},
    ]


def test_rejects_non_audio_extension():
    assert is_allowed_upload("not-a-sound.txt") is False


def test_accepts_expected_audio_extensions():
    assert ".wav" in ALLOWED_EXTENSIONS
    assert is_allowed_upload("ping-success.wav") is True
    assert is_allowed_upload("failure.ogg") is True


def test_bundled_sound_files_exist():
    assert (REPO_ROOT / "sounds" / "bundled" / "ping-success.wav").exists()
    assert (REPO_ROOT / "sounds" / "bundled" / "ping-failure.wav").exists()
    assert (REPO_ROOT / "sounds" / "bundled" / "ping-ringtone.wav").exists()
    assert (REPO_ROOT / "sounds" / "bundled" / "notification-soft.wav").exists()
    assert (REPO_ROOT / "sounds" / "bundled" / "beep-ping.wav").exists()
    assert (REPO_ROOT / "sounds" / "bundled" / "harmonic-beep.wav").exists()


def test_catalog_preserves_duplicate_names_by_source():
    sounds = list_available_sounds(
        bundled=["ping-success.wav"],
        custom=["ping-success.wav"],
    )

    assert sounds == [
        {"name": "ping-success.wav", "source": "bundled"},
        {"name": "ping-success.wav", "source": "custom"},
    ]

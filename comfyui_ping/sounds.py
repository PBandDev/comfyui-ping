from collections.abc import Iterable
from pathlib import Path
from typing import TypedDict


REPO_ROOT = Path(__file__).resolve().parents[1]
SOUNDS_DIR = REPO_ROOT / "sounds"
LEGACY_BUNDLED_SOUNDS_DIR = SOUNDS_DIR / "bundled"
LEGACY_CUSTOM_SOUNDS_DIR = SOUNDS_DIR / "custom"
LEGACY_INPUT_SOUNDS_DIR = REPO_ROOT / "input" / "ping"
ALLOWED_EXTENSIONS = {".wav", ".mp3", ".ogg", ".m4a", ".flac"}
MAX_UPLOAD_BYTES = 10 * 1024 * 1024


class SoundCatalogEntry(TypedDict):
    name: str


def is_allowed_upload(filename: str) -> bool:
    return Path(filename).suffix.lower() in ALLOWED_EXTENSIONS


def list_available_sounds(sounds: Iterable[str]) -> list[SoundCatalogEntry]:
    return [{"name": name} for name in sounds]


def list_sound_files(directory: Path) -> list[str]:
    if not directory.exists():
        return []

    return sorted(
        file.name
        for file in directory.iterdir()
        if file.is_file() and is_allowed_upload(file.name)
    )


def ensure_sound_storage(
    sounds_dir: Path = SOUNDS_DIR,
    legacy_custom_dir: Path = LEGACY_INPUT_SOUNDS_DIR,
) -> Path:
    sounds_dir.mkdir(parents=True, exist_ok=True)

    for legacy_dir in (
        LEGACY_BUNDLED_SOUNDS_DIR,
        LEGACY_CUSTOM_SOUNDS_DIR,
        legacy_custom_dir,
    ):
        if legacy_dir == sounds_dir or not legacy_dir.exists():
            continue

        for legacy_file in legacy_dir.iterdir():
            if not legacy_file.is_file() or not is_allowed_upload(legacy_file.name):
                continue

            target_path = sounds_dir / legacy_file.name
            if target_path.exists():
                legacy_file.unlink(missing_ok=True)
                continue

            legacy_file.replace(target_path)

    return sounds_dir

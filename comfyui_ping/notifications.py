from dataclasses import dataclass

PING_EVENT_NAME = "comfyui-ping.notification"
SOUND_PREFIXES = ("bundled:", "custom:")


@dataclass(frozen=True)
class NotificationPayload:
    event_kind: str
    status: str
    sound_id: str | None
    allow_fallback: bool
    volume: float = 0.8
    source: str = ""


def normalize_status(status: str) -> str:
    return "failure" if status == "error" else status


def resolve_sound_id(
    status: str,
    global_settings: dict[str, str],
    node_overrides: dict[str, str] | None,
) -> str | None:
    sound_key = f"{normalize_status(status)}_sound"
    if node_overrides and node_overrides.get(sound_key):
        return normalize_sound_id(node_overrides[sound_key])
    return normalize_sound_id(global_settings.get(sound_key))


def normalize_sound_id(sound_id: str | None) -> str | None:
    if sound_id is None or sound_id == "":
        return None
    if sound_id.startswith(SOUND_PREFIXES):
        return sound_id
    return f"bundled:{sound_id}"


def build_notification_payload(
    event_kind: str,
    status: str,
    global_settings: dict[str, str],
    node_overrides: dict[str, str] | None,
    *,
    volume: float = 0.8,
    source: str | None = None,
) -> NotificationPayload:
    normalized_status = normalize_status(status)
    return NotificationPayload(
        event_kind=event_kind,
        status=normalized_status,
        sound_id=resolve_sound_id(
            status=normalized_status,
            global_settings=global_settings,
            node_overrides=node_overrides,
        ),
        allow_fallback=False,
        volume=volume,
        source=source or event_kind,
    )


def build_global_notification_payload(
    status: str,
    global_settings: dict[str, str],
    *,
    volume: float = 0.8,
    source: str = "queue_drained",
) -> NotificationPayload:
    return build_notification_payload(
        event_kind="global",
        status=status,
        global_settings=global_settings,
        node_overrides=None,
        volume=volume,
        source=source,
    )

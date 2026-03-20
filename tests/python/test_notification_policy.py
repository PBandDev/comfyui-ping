import sys
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


from comfyui_ping import build_notification_payload, resolve_sound_id


def test_notification_payload_includes_status_and_sound_id():
    payload = build_notification_payload(
        event_kind="global",
        status="failure",
        global_settings={"failure_sound": "buzz.wav"},
        node_overrides=None,
    )

    assert payload.status == "failure"
    assert payload.sound_id == "buzz.wav"
    assert payload.volume == 0.8
    assert payload.source == "global"


def test_notification_policy_prefers_node_override():
    payload = build_notification_payload(
        event_kind="node",
        status="success",
        global_settings={"success_sound": "global-success.wav"},
        node_overrides={"success_sound": "node-success.wav"},
    )

    assert payload.sound_id == "node-success.wav"


def test_invalid_custom_sound_does_not_fallback():
    payload = build_notification_payload(
        event_kind="global",
        status="failure",
        global_settings={"failure_sound": "missing.wav"},
        node_overrides=None,
    )

    assert payload.allow_fallback is False


def test_resolve_sound_id_uses_global_value_without_override():
    assert (
        resolve_sound_id(
            status="failure",
            global_settings={"failure_sound": "global-failure.wav"},
            node_overrides=None,
        )
        == "global-failure.wav"
    )


def test_notification_policy_normalizes_legacy_prefixed_sound_id():
    payload = build_notification_payload(
        event_kind="node",
        status="failure",
        global_settings={"failure_sound": "bundled:global-failure.wav"},
        node_overrides={"failure_sound": "custom:alert.wav"},
    )

    assert payload.sound_id == "alert.wav"

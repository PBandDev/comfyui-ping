import sys
import types
from contextlib import contextmanager
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))


from comfyui_ping.global_completion import (
    build_global_completion_payload,
    install_global_completion_hooks,
    resolve_global_completion_payload,
    should_notify_global,
)


@contextmanager
def fake_execution_module(prompt_queue_cls: type):
    original_execution = sys.modules.get("execution")
    execution_module = types.ModuleType("execution")
    execution_module.PromptQueue = prompt_queue_cls
    sys.modules["execution"] = execution_module
    try:
        yield
    finally:
        if original_execution is None:
            sys.modules.pop("execution", None)
        else:
            sys.modules["execution"] = original_execution


def test_queue_drained_mode_skips_nonfinal_prompt():
    assert should_notify_global(
        notify_mode="queue_drained",
        queue_size_after_completion=2,
    ) is False


def test_every_prompt_mode_notifies_each_completion():
    assert should_notify_global(
        notify_mode="every_prompt",
        queue_size_after_completion=2,
    ) is True


def test_build_global_completion_payload_uses_global_event_kind():
    payload = build_global_completion_payload(
        status="failure",
        global_settings={"failure_sound": "global-failure.wav"},
    )

    assert payload.event_kind == "global"
    assert payload.status == "failure"
    assert payload.sound_id == "bundled:global-failure.wav"


def test_resolve_global_completion_payload_normalizes_error_status():
    payload = resolve_global_completion_payload(
        status="error",
        queue_size_after_completion=0,
        runtime_settings={
            "enabled": True,
            "notify_mode": "queue_drained",
            "success_enabled": True,
            "failure_enabled": True,
            "success_sound": "ping-success.wav",
            "failure_sound": "custom:uploaded.wav",
            "volume": 0.45,
        },
    )

    assert payload is not None
    assert payload.status == "failure"
    assert payload.sound_id == "custom:uploaded.wav"
    assert payload.volume == 0.45


def test_resolve_global_completion_payload_skips_disabled_failure_notifications():
    payload = resolve_global_completion_payload(
        status="error",
        queue_size_after_completion=0,
        runtime_settings={
            "enabled": True,
            "notify_mode": "queue_drained",
            "success_enabled": True,
            "failure_enabled": False,
            "success_sound": "ping-success.wav",
            "failure_sound": "ping-failure.wav",
            "volume": 0.8,
        },
    )

    assert payload is None


def test_reinstall_updates_callbacks_after_noop_install():
    emitted_payloads = []

    class FakeStatus:
        status_str = "success"

    class FakePromptQueue:
        def __init__(self):
            self.queue = []
            self.calls = []

        def task_done(self, item_id, history_result, status):
            self.calls.append((item_id, history_result, status.status_str))
            return "done"

    with fake_execution_module(FakePromptQueue):
        assert install_global_completion_hooks() is True
        assert install_global_completion_hooks(
            emit_notification=emitted_payloads.append,
            get_runtime_settings=lambda: {
                "enabled": True,
                "notify_mode": "queue_drained",
                "success_enabled": True,
                "failure_enabled": True,
                "success_sound": "global-success.wav",
                "failure_sound": "global-failure.wav",
                "volume": 0.65,
            },
        ) is True

        queue = FakePromptQueue()
        result = queue.task_done("item-1", {"history": True}, FakeStatus())

    assert result == "done"
    assert emitted_payloads[0].event_kind == "global"
    assert emitted_payloads[0].status == "success"
    assert emitted_payloads[0].sound_id == "bundled:global-success.wav"
    assert emitted_payloads[0].volume == 0.65
    assert len(emitted_payloads) == 1


def test_wrapped_task_done_accepts_process_item_keyword():
    emitted_payloads = []

    class FakeStatus:
        status_str = "success"

    class FakePromptQueue:
        def __init__(self):
            self.queue = []
            self.calls = []

        def task_done(self, item_id, history_result, status, process_item=None):
            self.calls.append(process_item)
            return "done"

    with fake_execution_module(FakePromptQueue):
        assert install_global_completion_hooks(
            emit_notification=emitted_payloads.append,
            get_runtime_settings=lambda: {
                "enabled": True,
                "notify_mode": "queue_drained",
                "success_enabled": True,
                "failure_enabled": True,
                "success_sound": "global-success.wav",
                "failure_sound": "global-failure.wav",
                "volume": 0.8,
            },
        ) is True

        queue = FakePromptQueue()
        result = queue.task_done(
            "item-1",
            {"history": True},
            FakeStatus(),
            process_item=lambda prompt: prompt,
        )

    assert result == "done"
    assert len(emitted_payloads) == 1

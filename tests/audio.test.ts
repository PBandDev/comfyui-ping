import { describe, expect, it, vi } from "vitest";
import {
  handleNotificationEvent,
  playNotification,
  shouldPlayNotification,
} from "../src/audio";

describe("shouldPlayNotification", () => {
  it("returns false when the selected sound is unavailable", () => {
    expect(
      shouldPlayNotification({
        selectedSound: "missing.wav",
        soundExists: false,
      })
    ).toBe(false);
  });

  it("returns true when a selected sound exists", () => {
    expect(
      shouldPlayNotification({
        selectedSound: "ping-success.wav",
        soundExists: true,
      })
    ).toBe(true);
  });
});

describe("playNotification", () => {
  it("warns and plays nothing for an invalid selected sound", async () => {
    const warn = vi.fn();
    const createAudio = vi.fn();

    const result = await playNotification({
      audioUrl: "unused",
      createAudio,
      logger: { warn },
      selectedSound: "missing.wav",
      soundExists: false,
      volume: 0.7,
    });

    expect(result.played).toBe(false);
    expect(createAudio).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Selected sound"));
  });

  it("clears stale current audio for an invalid selected sound", async () => {
    const pause = vi.fn();
    const warn = vi.fn();
    const currentAudio = {
      currentTime: 9,
      pause,
      play: vi.fn(),
      volume: 0.2,
    };

    const result = await playNotification({
      audioUrl: "unused",
      createAudio: vi.fn(),
      currentAudio,
      logger: { warn },
      selectedSound: "missing.wav",
      soundExists: false,
      volume: 0.7,
    });

    expect(pause).toHaveBeenCalledTimes(1);
    expect(currentAudio.currentTime).toBe(0);
    expect(result.played).toBe(false);
    expect(result.audio).toBeNull();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Selected sound"));
  });

  it("stops the previous audio before playing a new sound", async () => {
    const pause = vi.fn();
    const play = vi.fn().mockResolvedValue(undefined);
    const currentAudio = {
      currentTime: 12,
      pause,
      play: vi.fn(),
      volume: 0,
    };
    const nextAudio = {
      currentTime: 0,
      pause: vi.fn(),
      play,
      volume: 0,
    };
    const createAudio = vi.fn(() => nextAudio);

    const result = await playNotification({
      audioUrl: "memory://ping-success",
      createAudio,
      currentAudio,
      selectedSound: "ping-success.wav",
      soundExists: true,
      stopPrevious: true,
      volume: 0.4,
    });

    expect(pause).toHaveBeenCalledTimes(1);
    expect(currentAudio.currentTime).toBe(0);
    expect(nextAudio.volume).toBe(0.4);
    expect(play).toHaveBeenCalledTimes(1);
    expect(result.played).toBe(true);
    expect(result.audio).toBe(nextAudio);
  });

  it("warns and returns a non-playing result when audio playback rejects", async () => {
    const warn = vi.fn();
    const pause = vi.fn();
    const play = vi.fn().mockRejectedValue(new Error("autoplay blocked"));
    const currentAudio = {
      currentTime: 4,
      pause,
      play: vi.fn(),
      volume: 0.3,
    };
    const nextAudio = {
      currentTime: 0,
      pause: vi.fn(),
      play,
      volume: 0,
    };

    const result = await playNotification({
      audioUrl: "memory://ping-failure",
      createAudio: vi.fn(() => nextAudio),
      currentAudio,
      logger: { warn },
      selectedSound: "ping-failure.wav",
      soundExists: true,
      volume: 0.5,
    });

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Unable to play notification audio")
    );
    expect(result.played).toBe(false);
    expect(result.audio).toBeNull();
  });
});

describe("handleNotificationEvent", () => {
  it("plays flat sound ids through the real backend sound route", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const audio = {
      currentTime: 0,
      pause: vi.fn(),
      play,
      volume: 0,
    };
    const createAudio = vi.fn(() => audio);

    const result = await handleNotificationEvent({
      catalog: [{ name: "uploaded.wav" }],
      createAudio,
      detail: {
        event_kind: "global",
        sound_id: "uploaded.wav",
        source: "queue_drained",
        status: "success",
        volume: 0.8,
      },
    });

    expect(createAudio).toHaveBeenCalledWith("/comfyui-ping/sounds/uploaded.wav");
    expect(play).toHaveBeenCalledTimes(1);
    expect(result.played).toBe(true);
  });

  it("normalizes legacy prefixed sound ids before playback", async () => {
    const play = vi.fn().mockResolvedValue(undefined);
    const audio = {
      currentTime: 0,
      pause: vi.fn(),
      play,
      volume: 0,
    };
    const createAudio = vi.fn(() => audio);

    const result = await handleNotificationEvent({
      catalog: [{ name: "uploaded.wav" }],
      createAudio,
      detail: {
        event_kind: "global",
        sound_id: "custom:uploaded.wav",
        source: "queue_drained",
        status: "success",
        volume: 0.8,
      },
    });

    expect(createAudio).toHaveBeenCalledWith("/comfyui-ping/sounds/uploaded.wav");
    expect(play).toHaveBeenCalledTimes(1);
    expect(result.played).toBe(true);
  });

  it("warns and stays silent when the selected sound is not in the catalog", async () => {
    const warn = vi.fn();
    const createAudio = vi.fn();

    const result = await handleNotificationEvent({
      catalog: [{ name: "ping-success.wav" }],
      createAudio,
      detail: {
        event_kind: "global",
        sound_id: "uploaded.wav",
        source: "queue_drained",
        status: "success",
        volume: 0.8,
      },
      logger: { warn },
    });

    expect(createAudio).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("Selected sound"));
    expect(result.played).toBe(false);
  });
});

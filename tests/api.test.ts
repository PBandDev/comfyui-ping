import { describe, expect, it } from "vitest";
import {
  buildSoundCatalogRoute,
  buildSoundFileRoute,
  buildSettingsRoute,
  buildSoundUploadRoute,
  fetchSoundCatalog,
  parseSoundCatalogPayload,
  parseSoundOptionId,
  storeRuntimeSettings,
  toSoundOptionId,
  type SoundCatalogEntry,
} from "../src/api";

describe("sound API helpers", () => {
  it("creates a stable option id from a source-aware catalog entry", () => {
    const entry: SoundCatalogEntry = {
      name: "ping-success.wav",
      source: "bundled",
    };

    expect(toSoundOptionId(entry)).toBe("bundled:ping-success.wav");
  });

  it("parses an option id back into a source-aware entry", () => {
    expect(parseSoundOptionId("custom:my-sound.wav")).toEqual({
      name: "my-sound.wav",
      source: "custom",
    });
  });

  it("rejects unsupported sound sources", () => {
    expect(() => parseSoundOptionId("unknown:my-sound.wav")).toThrow(
      "Unsupported sound source: unknown"
    );
  });

  it("builds the real backend routes for catalog, file, and upload requests", () => {
    expect(buildSoundCatalogRoute()).toBe("/comfyui-ping/sounds");
    expect(buildSoundUploadRoute()).toBe("/comfyui-ping/sounds/upload");
    expect(buildSettingsRoute()).toBe("/comfyui-ping/settings");
    expect(
      buildSoundFileRoute({
        name: "my sound.wav",
        source: "custom",
      })
    ).toBe("/comfyui-ping/sounds/custom/my%20sound.wav");
  });

  it("parses the source-aware catalog payload", () => {
    expect(
      parseSoundCatalogPayload({
        sounds: [{ name: "custom.wav", source: "custom" }],
      })
    ).toEqual({
      sounds: [{ name: "custom.wav", source: "custom" }],
    });
  });

  it("loads the sound catalog through fetchApi", async () => {
    const fetchApi = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          sounds: [{ name: "uploaded.wav", source: "custom" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );

    await expect(fetchSoundCatalog({ fetchApi })).resolves.toEqual({
      sounds: [{ name: "uploaded.wav", source: "custom" }],
    });
  });

  it("stores runtime notification settings through fetchApi", async () => {
    const settings = {
      enabled: true,
      failure_enabled: false,
      failure_sound: "bundled:ping-failure.wav",
      notify_mode: "queue_drained",
      success_enabled: true,
      success_sound: "custom:uploaded.wav",
      volume: 0.45,
    } as const;

    const fetchApi = async (
      _route: string,
      options?: RequestInit
    ): Promise<Response> =>
      new Response(options?.body as BodyInit, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    await expect(
      storeRuntimeSettings({ fetchApi }, settings)
    ).resolves.toEqual(settings);
  });
});

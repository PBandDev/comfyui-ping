import { describe, expect, it } from "vitest";
import {
  buildSoundCatalogRoute,
  buildSoundFileRoute,
  buildSettingsRoute,
  buildSoundUploadRoute,
  fetchSoundCatalog,
  normalizeSoundOptionId,
  parseSoundCatalogPayload,
  parseSoundOptionId,
  storeRuntimeSettings,
  toSoundOptionId,
  type SoundCatalogEntry,
} from "../src/api";

describe("sound API helpers", () => {
  it("creates a stable option id from a flat catalog entry", () => {
    const entry: SoundCatalogEntry = {
      name: "ping-success.wav",
    };

    expect(toSoundOptionId(entry)).toBe("ping-success.wav");
  });

  it("normalizes a legacy prefixed option id into a flat entry", () => {
    expect(parseSoundOptionId("custom:my-sound.wav")).toEqual({
      name: "my-sound.wav",
    });
  });

  it("leaves plain option ids unchanged when normalizing", () => {
    expect(normalizeSoundOptionId("my-sound.wav")).toBe("my-sound.wav");
  });

  it("builds the real backend routes for catalog, file, and upload requests", () => {
    expect(buildSoundCatalogRoute()).toBe("/comfyui-ping/sounds");
    expect(buildSoundUploadRoute()).toBe("/comfyui-ping/sounds/upload");
    expect(buildSettingsRoute()).toBe("/comfyui-ping/settings");
    expect(
      buildSoundFileRoute({
        name: "my sound.wav",
      })
    ).toBe("/comfyui-ping/sounds/my%20sound.wav");
  });

  it("parses the flat catalog payload", () => {
    expect(
      parseSoundCatalogPayload({
        sounds: [{ name: "custom.wav" }],
      })
    ).toEqual({
      sounds: [{ name: "custom.wav" }],
    });
  });

  it("loads the sound catalog through fetchApi", async () => {
    const fetchApi = async (): Promise<Response> =>
      new Response(
        JSON.stringify({
          sounds: [{ name: "uploaded.wav" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );

    await expect(fetchSoundCatalog({ fetchApi })).resolves.toEqual({
      sounds: [{ name: "uploaded.wav" }],
    });
  });

  it("stores runtime notification settings through fetchApi", async () => {
    const settings = {
      enabled: true,
      failure_enabled: false,
      failure_sound: "ping-failure.wav",
      notify_mode: "queue_drained",
      success_enabled: true,
      success_sound: "uploaded.wav",
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

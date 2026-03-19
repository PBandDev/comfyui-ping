import { describe, expect, it, vi } from "vitest";
import {
  applySoundCatalogToSettings,
  buildRenderedSoundOptions,
  DEFAULT_FAILURE_SOUND_ID,
  DEFAULT_SUCCESS_SOUND_ID,
  PING_EVENT_NAME,
  PING_EXTENSION,
  PING_SETTINGS,
  PING_SETTINGS_IDS,
  syncRuntimeSettings,
  refreshSoundCatalog,
  tryUploadCustomSound,
} from "../src/index";

type FakeListener = () => void;

class FakeElement {
  public readonly children: FakeElement[] = [];
  public readonly style: Record<string, string> = {};
  public textContent = "";
  protected readonly listeners = new Map<string, FakeListener[]>();

  public constructor(public readonly tagName: string) {}

  public addEventListener(type: string, listener: FakeListener): void {
    const listeners = this.listeners.get(type) ?? [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  public append(...nodes: FakeElement[]): void {
    this.children.push(...nodes);
  }

  public dispatchEvent(event: Event): boolean {
    for (const listener of this.listeners.get(event.type) ?? []) {
      listener();
    }
    return true;
  }

  public querySelector(selector: string): FakeElement | null {
    for (const child of this.children) {
      if (child.tagName === selector) {
        return child;
      }
      const nested = child.querySelector(selector);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  public replaceChildren(...nodes: FakeElement[]): void {
    this.children.length = 0;
    this.children.push(...nodes);
  }
}

class FakeOptionElement extends FakeElement {
  public selected = false;
  public value = "";

  public constructor() {
    super("option");
  }
}

class FakeSelectElement extends FakeElement {
  public selectedIndex = -1;

  public constructor() {
    super("select");
  }

  public get options(): FakeOptionElement[] {
    return this.children.filter(
      (child): child is FakeOptionElement => child instanceof FakeOptionElement
    );
  }

  public get value(): string {
    return this.options.find((option) => option.selected)?.value ?? "";
  }

  public set value(nextValue: string) {
    let matchedIndex = -1;
    for (const [index, option] of this.options.entries()) {
      option.selected = option.value === nextValue;
      if (option.selected) {
        matchedIndex = index;
      }
    }

    this.selectedIndex = matchedIndex;
  }
}

class FakeDocument {
  public createElement(tagName: string): FakeElement {
    if (tagName === "option") {
      return new FakeOptionElement();
    }
    if (tagName === "select") {
      return new FakeSelectElement();
    }
    return new FakeElement(tagName);
  }
}

describe("PING_SETTINGS", () => {
  it("includes the expected notification settings", () => {
    const settingIds = PING_SETTINGS.map((setting) => setting.id);

    expect(settingIds).toEqual(
      expect.arrayContaining([
        PING_SETTINGS_IDS.GLOBAL_ENABLED,
        PING_SETTINGS_IDS.NOTIFY_MODE,
        PING_SETTINGS_IDS.SUCCESS_ENABLED,
        PING_SETTINGS_IDS.FAILURE_ENABLED,
        PING_SETTINGS_IDS.SUCCESS_SOUND,
        PING_SETTINGS_IDS.FAILURE_SOUND,
        PING_SETTINGS_IDS.UPLOAD_ACTION,
        PING_SETTINGS_IDS.VOLUME,
      ])
    );
  });

  it("uses bundled defaults for success and failure sounds", () => {
    const successSetting = PING_SETTINGS.find(
      (setting) => setting.id === PING_SETTINGS_IDS.SUCCESS_SOUND
    );
    const failureSetting = PING_SETTINGS.find(
      (setting) => setting.id === PING_SETTINGS_IDS.FAILURE_SOUND
    );

    expect(successSetting?.defaultValue).toBe(DEFAULT_SUCCESS_SOUND_ID);
    expect(failureSetting?.defaultValue).toBe(DEFAULT_FAILURE_SOUND_ID);
  });

  it("applies source-aware catalog options to both sound settings", () => {
    applySoundCatalogToSettings({
      sounds: [
        { name: "ping-success.wav", source: "bundled" },
        { name: "uploaded.wav", source: "custom" },
      ],
    });

    const successSetting = PING_SETTINGS.find(
      (setting) => setting.id === PING_SETTINGS_IDS.SUCCESS_SOUND
    );
    const failureSetting = PING_SETTINGS.find(
      (setting) => setting.id === PING_SETTINGS_IDS.FAILURE_SOUND
    );

    expect(successSetting?.options).toEqual([
      { text: "Bundled / ping-success.wav", value: "bundled:ping-success.wav" },
      { text: "Custom / uploaded.wav", value: "custom:uploaded.wav" },
    ]);
    expect(failureSetting?.options).toEqual([
      { text: "Bundled / ping-success.wav", value: "bundled:ping-success.wav" },
      { text: "Custom / uploaded.wav", value: "custom:uploaded.wav" },
    ]);
  });

  it("preserves a persisted custom selection while the live catalog is still loading", () => {
    expect(
      buildRenderedSoundOptions(
        [{ text: "Bundled / ping-success.wav", value: "bundled:ping-success.wav" }],
        "custom:uploaded.wav"
      )
    ).toEqual([
      {
        text: "Custom / uploaded.wav (unavailable)",
        value: "custom:uploaded.wav",
      },
      { text: "Bundled / ping-success.wav", value: "bundled:ping-success.wav" },
    ]);
  });

  it("refreshes the sound catalog through fetchApi", async () => {
    const fetchApi = vi.fn(async () =>
      new Response(
        JSON.stringify({
          sounds: [{ name: "uploaded.wav", source: "custom" }],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    await expect(
      refreshSoundCatalog({
        api: {
          addEventListener: vi.fn(),
          fetchApi,
        },
      })
    ).resolves.toEqual({
      sounds: [{ name: "uploaded.wav", source: "custom" }],
    });
    expect(fetchApi).toHaveBeenCalledWith("/comfyui-ping/sounds", undefined);
  });

  it("syncs runtime notification settings from current setting values", async () => {
    const fetchApi = vi.fn(
      async (_route: string, options?: RequestInit): Promise<Response> =>
        new Response(options?.body as BodyInit, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );

    await expect(
      syncRuntimeSettings({
        api: {
          addEventListener: vi.fn(),
          fetchApi,
        },
        ui: {
          settings: {
            getSettingValue: (id: string, defaultValue?: unknown) => {
              if (id === PING_SETTINGS_IDS.GLOBAL_ENABLED) {
                return false;
              }
              if (id === PING_SETTINGS_IDS.NOTIFY_MODE) {
                return "every_prompt";
              }
              if (id === PING_SETTINGS_IDS.SUCCESS_ENABLED) {
                return true;
              }
              if (id === PING_SETTINGS_IDS.FAILURE_ENABLED) {
                return false;
              }
              if (id === PING_SETTINGS_IDS.SUCCESS_SOUND) {
                return "custom:uploaded.wav";
              }
              if (id === PING_SETTINGS_IDS.FAILURE_SOUND) {
                return "bundled:ping-failure.wav";
              }
              if (id === PING_SETTINGS_IDS.VOLUME) {
                return 0.35;
              }
              return defaultValue;
            },
          },
        },
      })
    ).resolves.toEqual({
      enabled: false,
      failure_enabled: false,
      failure_sound: "bundled:ping-failure.wav",
      notify_mode: "every_prompt",
      success_enabled: true,
      success_sound: "custom:uploaded.wav",
      volume: 0.35,
    });

    expect(fetchApi).toHaveBeenCalledWith(
      "/comfyui-ping/settings",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("warns and leaves settings unchanged when a custom sound upload fails", async () => {
    const warn = vi.fn();
    const fetchApi = vi.fn(async () =>
      new Response(
        JSON.stringify({
          error: "Filename already exists in custom sounds",
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        }
      )
    );

    await expect(
      tryUploadCustomSound(
        {
          api: {
            addEventListener: vi.fn(),
            fetchApi,
          },
        },
        new File(["sound"], "uploaded.wav", { type: "audio/wav" }),
        { warn }
      )
    ).resolves.toBeNull();

    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("Unable to upload custom sound")
    );
    expect(fetchApi).toHaveBeenCalledWith(
      "/comfyui-ping/sounds/upload",
      expect.objectContaining({
        method: "POST",
      })
    );
  });

  it("syncs runtime settings when the custom success sound renderer changes", async () => {
    let successSoundValue = DEFAULT_SUCCESS_SOUND_ID;
    const fetchApi = vi.fn(
      async (_route: string, options?: RequestInit): Promise<Response> =>
        new Response(options?.body as BodyInit, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );

    vi.stubGlobal("app", {
      api: {
        addEventListener: vi.fn(),
        fetchApi,
      },
      ui: {
        settings: {
          getSettingValue: (id: string, defaultValue?: unknown) => {
            if (id === PING_SETTINGS_IDS.SUCCESS_SOUND) {
              return successSoundValue;
            }
            return defaultValue;
          },
          settingsLookup: {
            [PING_SETTINGS_IDS.SUCCESS_SOUND]: {
              onChange: PING_SETTINGS.find(
                (setting) => setting.id === PING_SETTINGS_IDS.SUCCESS_SOUND
              )?.onChange,
            },
          },
        },
      },
    });
    vi.stubGlobal("document", new FakeDocument());

    const successSetting = PING_SETTINGS.find(
      (setting) => setting.id === PING_SETTINGS_IDS.SUCCESS_SOUND
    );

    if (typeof successSetting?.type !== "function") {
      throw new Error("Expected a renderer function for the success sound setting");
    }

    const rendered = successSetting.type(
      "Success Sound",
      (value: unknown) => {
        successSoundValue = String(value);
      },
      successSoundValue
    );

    const selectEl = rendered.querySelector("select") as HTMLSelectElement | null;
    if (!selectEl) {
      throw new Error("Expected the renderer to return a select element");
    }

    selectEl.value = "bundled:ping-failure.wav";
    selectEl.dispatchEvent(new Event("change"));
    await Promise.resolve();

    expect(fetchApi).toHaveBeenCalledWith(
      "/comfyui-ping/settings",
      expect.objectContaining({
        method: "POST",
      })
    );

    vi.unstubAllGlobals();
  });

  it("previews the selected sound from the sound setting renderer", async () => {
    class FakeAudio {
      public static created: FakeAudio[] = [];
      public currentTime = 0;
      public readonly pause = vi.fn();
      public readonly play = vi.fn(async () => undefined);
      public volume = 0;

      public constructor(public readonly src: string) {
        FakeAudio.created.push(this);
      }
    }

    let successSoundValue = "custom:uploaded.wav";

    vi.stubGlobal("app", {
      ui: {
        settings: {
          getSettingValue: (id: string, defaultValue?: unknown) => {
            if (id === PING_SETTINGS_IDS.SUCCESS_SOUND) {
              return successSoundValue;
            }
            if (id === PING_SETTINGS_IDS.VOLUME) {
              return 0.35;
            }
            return defaultValue;
          },
        },
      },
    });
    vi.stubGlobal("Audio", FakeAudio);
    vi.stubGlobal("document", new FakeDocument());

    applySoundCatalogToSettings({
      sounds: [
        { name: "ping-success.wav", source: "bundled" },
        { name: "uploaded.wav", source: "custom" },
      ],
    });

    const successSetting = PING_SETTINGS.find(
      (setting) => setting.id === PING_SETTINGS_IDS.SUCCESS_SOUND
    );

    if (typeof successSetting?.type !== "function") {
      throw new Error("Expected a renderer function for the success sound setting");
    }

    const rendered = successSetting.type(
      "Success Sound",
      (value: unknown) => {
        successSoundValue = String(value);
      },
      successSoundValue
    );

    const playButton = rendered.querySelector("button");
    if (!playButton) {
      throw new Error("Expected the renderer to return a play button");
    }

    playButton.dispatchEvent(new Event("click"));
    await Promise.resolve();

    expect(FakeAudio.created).toHaveLength(1);
    expect(FakeAudio.created[0]?.src).toBe("/comfyui-ping/sounds/custom/uploaded.wav");
    expect(FakeAudio.created[0]?.volume).toBe(0.35);
    expect(FakeAudio.created[0]?.play).toHaveBeenCalledTimes(1);

    vi.unstubAllGlobals();
  });

  it("subscribes to ping notification events", async () => {
    const addEventListener = vi.fn();

    vi.stubGlobal("app", {
      api: {
        addEventListener,
        fetchApi: vi.fn(async () =>
          new Response(
            JSON.stringify({
              sounds: [{ name: "ping-success.wav", source: "bundled" }],
            }),
            {
              status: 200,
              headers: { "Content-Type": "application/json" },
            }
          )
        ),
      },
    });

    expect(PING_EVENT_NAME).toBe("comfyui-ping.notification");

    await PING_EXTENSION.setup?.();

    expect(addEventListener).toHaveBeenCalledWith(
      PING_EVENT_NAME,
      expect.any(Function)
    );

    vi.unstubAllGlobals();
  });
});

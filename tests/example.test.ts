import { describe, expect, it, vi } from "vitest";

describe("ping extension registration", () => {
  it("registers the comfyui-ping extension", async () => {
    const registerExtension = vi.fn();

    vi.stubGlobal("app", {
      registerExtension,
    });

    await import("../src/index");

    expect(registerExtension).toHaveBeenCalledTimes(1);
    expect(registerExtension).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "comfyui-ping",
      })
    );

    vi.unstubAllGlobals();
  });
});

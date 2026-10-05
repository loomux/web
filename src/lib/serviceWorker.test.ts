import { describe, expect, it, vi } from "vitest";
import { registerServiceWorker } from "./serviceWorker";

function fakeNavigator(register = vi.fn().mockResolvedValue({})) {
  return { nav: { serviceWorker: { register } } as unknown as Navigator, register };
}

describe("registerServiceWorker (LOOM-102)", () => {
  it("registers /sw.js once the page has loaded, in production", () => {
    const { nav, register } = fakeNavigator();
    registerServiceWorker(nav, true);
    expect(register).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("load"));
    expect(register).toHaveBeenCalledWith("/sw.js");
  });

  it("does nothing in development", () => {
    const { nav, register } = fakeNavigator();
    registerServiceWorker(nav, false);
    window.dispatchEvent(new Event("load"));
    expect(register).not.toHaveBeenCalled();
  });

  it("does nothing where service workers aren't supported", () => {
    expect(() => registerServiceWorker({} as Navigator, true)).not.toThrow();
  });

  it("keeps the app working when registration fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { nav } = fakeNavigator(vi.fn().mockRejectedValue(new Error("blocked")));
    registerServiceWorker(nav, true);
    window.dispatchEvent(new Event("load"));
    await vi.waitFor(() => expect(warn).toHaveBeenCalled());
    warn.mockRestore();
  });
});

import { describe, expect, it, vi, afterEach } from "vitest";
import type { ReactNode } from "react";
import { act, renderHook } from "@testing-library/react";
import { api, ApiError } from "./api";
import { AuthProvider } from "./auth";
import { useAuth } from "./authContext";
import { useApiClient } from "./useApiClient";

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

function useBoth() {
  return { auth: useAuth(), client: useApiClient() };
}

function storageEvent(newValue: string | null) {
  window.dispatchEvent(new StorageEvent("storage", { key: "loomux.token", newValue }));
}

describe("AuthProvider", () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  it("clears the token on a 401", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    vi.spyOn(api, "listWorkspaces").mockRejectedValue(new ApiError(401, "expired"));
    const { result } = renderHook(useBoth, { wrapper });

    await act(async () => {
      await expect(result.current.client.listWorkspaces()).rejects.toThrow();
    });
    expect(result.current.auth.token).toBeNull();
    expect(localStorage.getItem("loomux.token")).toBeNull();
  });

  // A request sent with the old token comes back 401 after logging in
  // again: that mustn't log the new session out.
  it("leaves a newer token alone when an old request gets a 401", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    let reject!: (err: unknown) => void;
    vi.spyOn(api, "listWorkspaces").mockReturnValue(new Promise((_, r) => (reject = r)));
    vi.spyOn(api, "login").mockResolvedValue({ token: "tok-2" });
    const { result } = renderHook(useBoth, { wrapper });

    let pending!: Promise<unknown>;
    act(() => {
      pending = result.current.client.listWorkspaces().catch(() => undefined);
    });
    await act(() => result.current.auth.login("hunter2"));
    await act(async () => {
      reject(new ApiError(401, "expired"));
      await pending;
    });

    expect(result.current.auth.token).toBe("tok-2");
    expect(localStorage.getItem("loomux.token")).toBe("tok-2");
  });

  it("leaves a token another tab logged in with alone", async () => {
    localStorage.setItem("loomux.token", "tok-1");
    vi.spyOn(api, "listWorkspaces").mockRejectedValue(new ApiError(401, "expired"));
    const { result } = renderHook(useBoth, { wrapper });
    const client = result.current.client; // still bound to tok-1

    localStorage.setItem("loomux.token", "tok-2");
    act(() => storageEvent("tok-2"));
    await act(async () => {
      await expect(client.listWorkspaces()).rejects.toThrow();
    });

    expect(result.current.auth.token).toBe("tok-2");
    expect(localStorage.getItem("loomux.token")).toBe("tok-2");
  });

  it("follows a logout in another tab", () => {
    localStorage.setItem("loomux.token", "tok-1");
    const { result } = renderHook(useAuth, { wrapper });

    localStorage.removeItem("loomux.token");
    act(() => storageEvent(null));
    expect(result.current.token).toBeNull();
  });

  it("picks up a login from another tab", () => {
    const { result } = renderHook(useAuth, { wrapper });
    expect(result.current.token).toBeNull();

    localStorage.setItem("loomux.token", "tok-2");
    act(() => storageEvent("tok-2"));
    expect(result.current.token).toBe("tok-2");
  });
});

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { api } from "./api";
import { AuthContext } from "./authContext";

// Token lives in localStorage (not memory-only): a page reload shouldn't
// force re-login, matching the server's own 30-day sliding-expiration
// design intent (loomux-server api/README.md) — see
// docs/design/web-client-design.md "Auth flow" for the full reasoning.
const STORAGE_KEY = "loomux.token";
export const SIGNED_OUT_KEY = "loomux.signedOut";
// This browser's device token (LOOM-151): kept across logouts, since
// it's what lets the server tell this browser's login attempts from a
// stranger's. It's never a session and never skips the password.
export const DEVICE_KEY = "loomux.device";

function readDevice(): string | null {
  try {
    return localStorage.getItem(DEVICE_KEY);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    localStorage.getItem(STORAGE_KEY),
  );

  const login = useCallback(async (password: string) => {
    const { token: newToken, device } = await api.login(password, readDevice());
    if (device) {
      try {
        localStorage.setItem(DEVICE_KEY, device);
      } catch {
        // next login just shares the global backoff
      }
    }
    localStorage.setItem(STORAGE_KEY, newToken);
    setToken(newToken);
  }, []);

  const logout = useCallback(() => {
    const current = token;
    localStorage.removeItem(STORAGE_KEY);
    setToken(null);
    if (current) {
      // Best-effort: revoke server-side too, but the client is logged out
      // either way — a failed revoke shouldn't block or re-show the app.
      void api.logout(current).catch(() => undefined);
    }
  }, [token]);

  // The server refused the session (expired, or revoked from another
  // device): note it, so the login page can say why it's showing.
  const handleUnauthorized = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    try {
      sessionStorage.setItem(SIGNED_OUT_KEY, "1");
    } catch {
      // the login page just won't explain
    }
    setToken(null);
  }, []);

  const value = useMemo(
    () => ({ token, login, logout, handleUnauthorized }),
    [token, login, logout, handleUnauthorized],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

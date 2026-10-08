import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/authContext";
import { SIGNED_OUT_KEY } from "../lib/auth";
import { ApiError } from "../lib/api";
import { Icon } from "../ui/icons";

function readSignedOut() {
  try {
    return sessionStorage.getItem(SIGNED_OUT_KEY) === "1";
  } catch {
    return false;
  }
}

function loginError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 401) return "Invalid password. Check it and try again.";
    if (err.status === 429) return "Too many tries. Wait a few seconds, then try again.";
    return err.message;
  }
  return "Couldn't reach Loomux. Check your connection and try again.";
}

export function LoginPage() {
  const { token, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [signedOut] = useState(readSignedOut);

  // Where to land after logging in: the page that sent us here
  // (ProtectedRoute's state.from, a path in this app), else the Inbox.
  const from = (location.state as { from?: string } | null)?.from;
  const next = from && from.startsWith("/") && !from.startsWith("//") ? from : "/";

  if (token) {
    return <Navigate to={next} replace />;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(password);
      try {
        sessionStorage.removeItem(SIGNED_OUT_KEY);
      } catch {
        // nothing to clear
      }
      navigate(next, { replace: true });
    } catch (err) {
      setError(loginError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-svh items-center justify-center bg-ground px-4 py-10">
      <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-5 rounded-card border border-line bg-surface p-6 shadow-2">
        <div className="flex items-center gap-2.5 text-2xl font-extrabold text-ink">
          <span className="grid size-10 place-items-center rounded-[11px] bg-ink text-surface">
            <Icon name="shuttle" className="size-6" />
          </span>
          <h1>Loomux</h1>
        </div>
        {signedOut && !error && (
          <p role="status" className="rounded-control bg-mari-soft px-3 py-2 text-sm text-mari-ink">
            You were signed out. Sign in to carry on where you were.
          </p>
        )}
        <div className="flex flex-col gap-1">
          <label htmlFor="password" className="font-bold text-ink">
            Password
          </label>
          <input
            id="password"
            type="password"
            autoComplete="current-password"
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="min-h-12 rounded-control border border-line bg-surface-2 px-3 text-ink"
          />
        </div>
        {error && (
          <p role="alert" className="text-sm text-bad">
            {error}
          </p>
        )}
        <button
          type="submit"
          disabled={submitting || password === ""}
          className="min-h-12 rounded-control bg-accent font-bold text-accent-ink hover:bg-accent-hover disabled:opacity-55"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}

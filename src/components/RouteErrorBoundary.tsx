import { Component, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

// Wraps the lazy-loaded routes. A failed chunk fetch (e.g. a tab left open
// across a redeploy — Vite's content-hashed filenames mean an old chunk
// 404s against the new deployment) throws out of React.lazy with nothing
// else to catch it, which would otherwise unmount the whole app to a blank
// screen. Reloading re-fetches index.html and the current chunk hashes, so
// for that case it reloads by itself, once: a marker in sessionStorage
// stops a loop if the reload doesn't help, and then the button shows.
const reloadMarker = "loomux.chunkReloadAt";
const reloadWindowMs = 10_000;

function isChunkLoadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
    message,
  );
}

function reloadedRecently(): boolean {
  try {
    const at = Number(sessionStorage.getItem(reloadMarker));
    return Number.isFinite(at) && Date.now() - at < reloadWindowMs;
  } catch {
    return true; // no storage: never risk a reload loop
  }
}

export class RouteErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("RouteErrorBoundary caught an error:", error);
    if (isChunkLoadError(error) && !reloadedRecently()) {
      try {
        sessionStorage.setItem(reloadMarker, String(Date.now()));
      } catch {
        return;
      }
      window.location.reload();
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-svh flex-col items-center justify-center gap-3 p-4 text-center">
          <p className="text-neutral-600 dark:text-neutral-400">
            Something went wrong loading this page.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="rounded bg-neutral-900 px-4 py-2 text-sm text-white dark:bg-neutral-100 dark:text-neutral-900"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

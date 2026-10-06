import { useState } from "react";
import { useApiClient } from "../lib/useApiClient";
import type { AttachInfoResponse } from "../lib/api";
import { attachCommand } from "../lib/attach";

// Surfaces the ssh + tmux attach command for a task, on demand — the
// client never opens an SSH connection itself, purely informational, per
// docs/design/web-client-design.md "Attach-info surfacing" (mirrors the
// design spec's own attach model, core-design.md §4).
export function AttachInfo({ taskId }: { taskId: string }) {
  const apiClient = useApiClient();
  const [info, setInfo] = useState<AttachInfoResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function reveal() {
    setLoading(true);
    setError(null);
    try {
      setInfo(await apiClient.getAttachInfo(taskId));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not fetch attach info");
    } finally {
      setLoading(false);
    }
  }

  if (!info) {
    return (
      <button
        onClick={reveal}
        disabled={loading}
        className="text-sm text-neutral-500 underline underline-offset-2 hover:text-neutral-800 dark:hover:text-neutral-200"
      >
        {loading ? "Loading attach info…" : "Show attach command"}
        {error && <span className="ml-2 text-red-600">{error}</span>}
      </button>
    );
  }

  const command = attachCommand(info);

  async function copy() {
    if (!navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Ignore copy failures; the command remains selectable as text.
    }
  }

  return (
    <div className="relative">
      <code className="block text-xs rounded bg-neutral-100 px-2 py-1.5 pr-16 dark:bg-neutral-800">
        {command}
      </code>
      <button
        onClick={copy}
        className="absolute right-1 top-1 rounded bg-neutral-200 px-2 py-0.5 text-xs hover:bg-neutral-300 dark:bg-neutral-700 dark:hover:bg-neutral-600"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

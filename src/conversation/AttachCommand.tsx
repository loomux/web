import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "../lib/useApiClient";
import { attachCommand } from "../lib/attach";
import type { AttachInfoResponse } from "../lib/api";
import { CopyText } from "../ui/CopyText";

// How to watch or drive a task's terminal yourself: the server's
// attach_command (it names Loomux's own tmux server), wrapped in ssh for a
// remote target. Fetched on demand; the client never opens SSH itself.
// A server whose attach-info has no ssh_port: the target list's is used.
export function AttachCommand({ taskId, label = "Show attach command" }: { taskId: string; label?: string }) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [info, setInfo] = useState<AttachInfoResponse | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  async function reveal() {
    setLoading(true);
    setError(false);
    try {
      const res = await apiClient.getAttachInfo(taskId);
      if (res.target.kind !== "local" && res.target.ssh_port === undefined) {
        const targets = await queryClient
          .ensureQueryData({ queryKey: ["targets"], queryFn: apiClient.listTargets })
          .catch(() => null);
        const port = targets?.targets.find((t) => t.id === res.target.id)?.ssh_port;
        if (port) res.target = { ...res.target, ssh_port: port };
      }
      setInfo(res);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }

  if (info) return <CopyText text={attachCommand(info)} label="Attach command" />;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button
        type="button"
        onClick={() => void reveal()}
        disabled={loading}
        className="min-h-9 text-sm font-bold text-accent underline-offset-2 hover:underline disabled:opacity-60"
      >
        {loading ? "Loading attach command…" : label}
      </button>
      {error && (
        <span role="alert" className="text-sm text-bad">
          Couldn't load it. Try again.
        </span>
      )}
    </div>
  );
}

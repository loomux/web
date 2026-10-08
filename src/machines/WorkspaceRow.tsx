import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import type { WorkspaceSummary } from "../lib/api";
import { workspaceStatus } from "../lib/status";
import { formatRelativeTime } from "../lib/time";
import { useApiClient } from "../lib/useApiClient";
import { Button } from "../ui/Button";
import { StatusMark } from "../ui/StatusMark";

// A workspace under its machine (LOOM-70): reopen a broken or archived one,
// archive an idle or broken one, delete any that isn't being set up, after
// a confirmation, since it can't be undone. What a delete left behind is
// reported by the machine (onDeleted), not here: this row is gone after it.
export function WorkspaceRow({
  ws,
  onChanged,
  onDeleted,
}: {
  ws: WorkspaceSummary;
  onChanged: () => void;
  onDeleted: (name: string, sessionsLeft: number) => void;
}) {
  const apiClient = useApiClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const setStatus = useMutation({
    mutationFn: (status: "idle" | "archived") => apiClient.setWorkspaceStatus(ws.id, status),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => apiClient.deleteWorkspace(ws.id),
    onSuccess: (res) => onDeleted(ws.name, res?.sessions_not_killed?.length ?? 0),
  });
  const busy = setStatus.isPending || remove.isPending;
  const failure = (setStatus.error ?? remove.error) as Error | null;

  const canReopen = ws.status === "failed" || ws.status === "archived";
  const canArchive = ws.status === "idle" || ws.status === "failed";
  const canDelete = ws.status !== "provisioning";

  return (
    <li className="flex flex-col gap-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 flex-col">
          <span className="font-bold break-all text-ink">{ws.name}</span>
          <span className="flex flex-wrap items-center gap-x-3 text-sm text-ink-3">
            <StatusMark status={workspaceStatus(ws.status)} className="font-normal" />
            {ws.last_used_at && <span>used {formatRelativeTime(ws.last_used_at)}</span>}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {canReopen && (
            <Button size="sm" isDisabled={busy} isPending={setStatus.isPending && setStatus.variables === "idle"} pendingLabel="Reopening…" onPress={() => setStatus.mutate("idle")}>
              Reopen
            </Button>
          )}
          {canArchive && (
            <Button size="sm" isDisabled={busy} isPending={setStatus.isPending && setStatus.variables === "archived"} pendingLabel="Archiving…" onPress={() => setStatus.mutate("archived")}>
              Archive
            </Button>
          )}
          {canDelete && !confirmDelete && (
            <Button size="sm" variant="danger" isDisabled={busy} onPress={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>
      {ws.status_reason && <p className="text-sm text-ink-2">{ws.status_reason}</p>}
      {confirmDelete && (
        <div className="flex flex-col gap-2 rounded-control border border-bad/40 bg-bad-soft p-3 text-sm">
          <p className="text-ink">
            Delete {ws.name} and its tasks? The conversation history stays, and its files on the machine are kept.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              isDisabled={busy}
              isPending={remove.isPending}
              pendingLabel="Deleting…"
              onPress={() => {
                setConfirmDelete(false);
                remove.mutate();
              }}
            >
              Yes, delete
            </Button>
            <Button size="sm" variant="quiet" onPress={() => setConfirmDelete(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {failure && (
        <p role="alert" className="text-sm text-bad">
          {failure.message}
        </p>
      )}
    </li>
  );
}

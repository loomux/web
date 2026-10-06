import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { WorkspaceSummary } from "../lib/api";
import { useApiClient } from "../lib/useApiClient";

const buttonClass =
  "rounded border border-neutral-300 px-2 py-0.5 text-xs hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800";

export function WorkspacesPage() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["workspaces"],
    queryFn: apiClient.listWorkspaces,
  });
  // Target names for each row; the id stands in until (or unless) they load.
  const { data: targetsData } = useQuery({ queryKey: ["targets"], queryFn: apiClient.listTargets });
  const targetNames = new Map((targetsData?.targets ?? []).map((t) => [t.id, t.name]));

  if (isLoading) return <p className="p-4 text-neutral-500">Loading workspaces…</p>;
  if (error) return <p className="p-4 text-red-600">{(error as Error).message}</p>;

  return (
    <div className="p-4 space-y-2">
      <h1 className="text-lg font-semibold">Workspaces</h1>
      {data?.workspaces.length === 0 && (
        <p className="text-neutral-500">No workspaces registered yet.</p>
      )}
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {data?.workspaces.map((ws) => (
          <WorkspaceRow
            key={ws.id}
            ws={ws}
            targetName={targetNames.get(ws.target_id) ?? ws.target_id}
            onChanged={() => void queryClient.invalidateQueries({ queryKey: ["workspaces"] })}
          />
        ))}
      </ul>
    </div>
  );
}

// One workspace, with what can be done to it (LOOM-70): reopen a failed or
// archived one, archive an idle or failed one, delete any not still
// provisioning — after a second click, since it can't be undone.
function WorkspaceRow({
  ws,
  targetName,
  onChanged,
}: {
  ws: WorkspaceSummary;
  targetName: string;
  onChanged: () => void;
}) {
  const apiClient = useApiClient();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const setStatus = useMutation({
    mutationFn: (status: "idle" | "archived") => apiClient.setWorkspaceStatus(ws.id, status),
    onSuccess: onChanged,
  });
  const remove = useMutation({
    mutationFn: () => apiClient.deleteWorkspace(ws.id),
    onSuccess: (res) => {
      const left = res?.sessions_not_killed ?? [];
      if (left.length > 0) {
        setNotice(`Deleted. ${left.length} tmux session(s) couldn't be stopped yet; they're cleaned up later.`);
      }
      onChanged();
    },
  });
  const busy = setStatus.isPending || remove.isPending;
  const failure = (setStatus.error ?? remove.error) as Error | null;

  const canReopen = ws.status === "failed" || ws.status === "archived";
  const canArchive = ws.status === "idle" || ws.status === "failed";
  const canDelete = ws.status !== "provisioning";

  return (
    <li className="py-3 space-y-1">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="font-medium">{ws.name}</p>
          <p className="text-sm text-neutral-500">target: {targetName}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm rounded-full border border-neutral-300 px-2 py-0.5 dark:border-neutral-700">
            {ws.status}
          </span>
          {canReopen && (
            <button type="button" className={buttonClass} disabled={busy} onClick={() => setStatus.mutate("idle")}>
              Reopen
            </button>
          )}
          {canArchive && (
            <button type="button" className={buttonClass} disabled={busy} onClick={() => setStatus.mutate("archived")}>
              Archive
            </button>
          )}
          {canDelete && !confirmDelete && (
            <button type="button" className={buttonClass} disabled={busy} onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
        </div>
      </div>
      {ws.status_reason && <p className="text-sm text-neutral-600 dark:text-neutral-400">{ws.status_reason}</p>}
      {confirmDelete && (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span>
            Delete {ws.name} and its tasks? The conversation history stays, and its files on the machine are kept.
          </span>
          <button
            type="button"
            className="rounded bg-red-700 px-2 py-0.5 text-xs text-white disabled:opacity-50"
            disabled={busy}
            onClick={() => {
              setConfirmDelete(false);
              remove.mutate();
            }}
          >
            Yes, delete
          </button>
          <button type="button" className={buttonClass} onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
        </div>
      )}
      {failure && <p className="text-sm text-red-600">{failure.message}</p>}
      {notice && <p className="text-sm text-neutral-600 dark:text-neutral-400">{notice}</p>}
    </li>
  );
}

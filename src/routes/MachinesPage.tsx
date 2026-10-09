import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import type { Target, WorkspaceSummary } from "../lib/api";
import { relayInfo } from "../lib/status";
import { compareTargets, defaultRelay, describePolicy, formatDestination } from "../lib/targets";
import { useApiClient } from "../lib/useApiClient";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { HealthSummary } from "../machines/Health";
import { WorkspaceRow } from "../machines/WorkspaceRow";
import { Button } from "../ui/Button";
import { Icon } from "../ui/icons";
import { StatusShapeIcon } from "../ui/StatusMark";

// Machines (principles 3): each machine with its health, its policy in
// plain words, what the router models see of it, whether its host key is
// pinned, and the workspaces that live on it. Workspaces only mean
// something on their machine, so they're listed there; settings, host
// keys and checks are one tap into a machine.

// A managed machine not ready yet (LOOM-138): what to do next, on its page.
const NEXT_STEP: Record<string, string> = {
  pin_host_key: "Setup: trust its host key",
  authorize_key: "Setup: let Loomux in",
  test_connection: "Setup: test the connection",
};

function MachineCard({
  target,
  workspaces,
  onChanged,
  onDeleted,
}: {
  target: Target;
  workspaces: WorkspaceSummary[];
  onChanged: () => void;
  onDeleted: (name: string, left: number) => void;
}) {
  const policy = describePolicy(target);
  const relay = relayInfo(target.relay_effective || target.relay || defaultRelay(target.purpose ?? "")).label;
  const remote = target.kind === "remote";
  const pinned = (target.pinned_host_keys ?? []).length > 0;
  return (
    <section aria-label={target.name} className="flex flex-col gap-3 rounded-card border border-line bg-surface p-4 shadow-1 md:p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-xl font-extrabold text-ink">{target.name}</h2>
          <p className="font-mono text-sm break-all text-ink-2">{formatDestination(target)}</p>
        </div>
        <Link
          to={`/machines/${target.id}`}
          className="inline-flex min-h-11 items-center rounded-control border border-line px-4 font-bold text-ink hover:bg-surface-2"
        >
          Settings and checks
        </Link>
      </header>
      <HealthSummary target={target} />
      <ul className="flex flex-col gap-1 text-sm text-ink-2">
        <li>{policy || "Anything may run here, without asking first."}</li>
        <li>
          The router models see: <b className="text-ink">{relay}</b>
        </li>
        {remote && (
          <li className="flex items-center gap-1.5">
            <StatusShapeIcon shape={pinned ? "check" : "diamond-open"} tone={pinned ? "good" : "mari"} />
            {pinned ? "Host key pinned" : "Host key not pinned"}
          </li>
        )}
        {remote && target.ssh_mode === "managed" && !target.ready && target.next_step && (
          <li className="flex items-center gap-1.5">
            <StatusShapeIcon shape="diamond" tone="mari" />
            {NEXT_STEP[target.next_step] ?? "Not ready yet"}
          </li>
        )}
        {remote && target.ssh_mode === "config" && (
          <li className="flex items-center gap-1.5">
            <StatusShapeIcon shape="square" tone="muted" />
            Signs in through the server's SSH config
          </li>
        )}
      </ul>
      <div>
        <h3 className="text-sm font-bold text-ink-3">Workspaces</h3>
        {workspaces.length === 0 ? (
          <p className="py-2 text-sm text-ink-3">None yet. The router sets them up here when you ask for work on {target.name}.</p>
        ) : (
          <ul className="divide-y divide-line">
            {workspaces.map((ws) => (
              <WorkspaceRow key={ws.id} ws={ws} onChanged={onChanged} onDeleted={onDeleted} />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

export function MachinesPage() {
  useDocumentTitle("Machines");
  const apiClient = useApiClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [notice, setNotice] = useState<string | null>(null);
  const targets = useQuery({ queryKey: ["targets"], queryFn: apiClient.listTargets, refetchInterval: 15_000 });
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: apiClient.listWorkspaces, refetchInterval: 15_000 });

  const refreshWorkspaces = () => void queryClient.invalidateQueries({ queryKey: ["workspaces"] });
  // Kept here, not in the row: the row is gone once its workspace is.
  const onDeleted = (name: string, left: number) => {
    setNotice(
      left > 0
        ? `Deleted ${name}. ${left} of its terminal session${left === 1 ? "" : "s"} couldn't be stopped yet; Loomux cleans ${left === 1 ? "it" : "them"} up later.`
        : `Deleted ${name}. Its files on the machine are kept.`,
    );
    refreshWorkspaces();
  };

  const sorted = useMemo(() => [...(targets.data?.targets ?? [])].sort(compareTargets), [targets.data]);
  const byTarget = useMemo(() => {
    const m = new Map<string, WorkspaceSummary[]>();
    for (const ws of workspaces.data?.workspaces ?? []) m.set(ws.target_id, [...(m.get(ws.target_id) ?? []), ws]);
    m.forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)));
    return m;
  }, [workspaces.data]);
  const known = new Set(sorted.map((t) => t.id));
  const orphans = (workspaces.data?.workspaces ?? []).filter((ws) => !known.has(ws.target_id));

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-5 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] font-extrabold text-ink">Machines</h1>
          <p className="text-ink-2">Where your agents run, and what they may do there.</p>
        </div>
        <Button variant="primary" onPress={() => navigate("/machines/new")}>
          <Icon name="plus" />
          Register machine
        </Button>
      </header>

      {notice && (
        <p role="status" className="mt-4 flex flex-wrap items-center gap-x-3 rounded-card border border-line bg-surface px-4 py-3 text-ink">
          {notice}
          <button type="button" className="min-h-9 text-sm font-bold text-ink-2 hover:text-ink" onClick={() => setNotice(null)}>
            Dismiss
          </button>
        </p>
      )}

      <div className="mt-6 flex flex-col gap-5">
        {targets.isLoading && <p className="text-ink-3">Loading…</p>}
        {targets.isError && (
          <p role="alert" className="rounded-card border border-bad/40 bg-bad-soft p-4 text-bad">
            Couldn't load your machines. Check that Loomux is reachable; this page retries on its own.
          </p>
        )}
        {targets.data && sorted.length === 0 && (
          <div className="rounded-card border border-dashed border-line px-5 py-8 text-center">
            <p className="font-bold text-ink">No machines yet.</p>
            <p className="mt-1 text-ink-2">
              {targets.data.local_targets === false
                ? "Register one to give your agents somewhere to work: a machine over SSH."
                : "Register one to give your agents somewhere to work: this host, or another over SSH."}
            </p>
          </div>
        )}
        {sorted.map((t) => (
          <MachineCard key={t.id} target={t} workspaces={byTarget.get(t.id) ?? []} onChanged={refreshWorkspaces} onDeleted={onDeleted} />
        ))}
        {orphans.length > 0 && (
          <section aria-label="Workspaces on an unknown machine" className="rounded-card border border-line bg-surface p-4">
            <h2 className="font-extrabold text-ink">Workspaces on a machine Loomux no longer knows</h2>
            <ul className="divide-y divide-line">
              {orphans.map((ws) => (
                <WorkspaceRow key={ws.id} ws={ws} onChanged={refreshWorkspaces} onDeleted={onDeleted} />
              ))}
            </ul>
          </section>
        )}
      </div>
    </div>
  );
}

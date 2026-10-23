import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { Target, TargetPlugin } from "../lib/api";
import { machinePhase, machineShape } from "../lib/plugins";
import { useApiClient } from "../lib/useApiClient";
import { Button } from "../ui/Button";
import { StatusShapeIcon } from "../ui/StatusMark";

// A machine a plugin made (LOOM-178): which instance made it, its shape,
// how far it got coming up (Creating → Starting → Ready, the image pull
// called out since a cold one takes minutes, LOOM-203), the plugin's
// warnings, and Start / Stop / Retry / Update. Its page polls while it's
// on its way (MachinePage).

const STEPS = ["Creating", "Starting", "Ready"];

export function CreatedBadge({ plugin }: { plugin: TargetPlugin }) {
  const phase = machinePhase(plugin);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-2">
      <span className="rounded-full border border-line px-2 py-0.5">
        Created by {plugin.name} · {plugin.label || "removed plugin"}
      </span>
      <span>{machineShape(plugin)}</span>
      <span className="flex items-center gap-1">
        <StatusShapeIcon shape={phase.tone === "good" ? "check" : phase.tone === "bad" ? "cross" : phase.busy ? "ring" : "square"} tone={phase.tone} />
        {phase.label}
      </span>
    </p>
  );
}

export function CreatedMachine({ target, plugin }: { target: Target; plugin: TargetPlugin }) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const phase = machinePhase(plugin);
  const detached = plugin.status === "detached" || !plugin.id;
  const act = useMutation({
    mutationFn: (verb: "start" | "stop" | "recreate") =>
      verb === "start" ? apiClient.startMachine(target.id) : verb === "stop" ? apiClient.stopMachine(target.id) : apiClient.recreateMachine(target.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["targets"] }),
  });
  return (
    <div className="flex flex-col gap-3">
      <CreatedBadge plugin={plugin} />
      {phase.step >= 0 && (
        <ol aria-label="Coming up" className="grid grid-cols-3 gap-1 text-sm">
          {STEPS.map((s, i) => (
            <li
              key={s}
              aria-current={i === phase.step ? "step" : undefined}
              className={`rounded-control border px-2 py-1.5 text-center ${i < phase.step || (i === 2 && phase.step === 2) ? "border-good/40 text-ink" : i === phase.step ? "border-accent font-bold text-ink" : "border-line text-ink-3"}`}
            >
              {i === phase.step && phase.pulling ? "Pulling the image" : s}
            </li>
          ))}
        </ol>
      )}
      {plugin.status_reason && (
        <p role={phase.tone === "bad" ? "alert" : "status"} className={`text-sm break-words ${phase.tone === "bad" ? "text-bad" : "text-ink-2"}`}>
          {plugin.status_reason}
        </p>
      )}
      {phase.pulling && <p className="text-sm text-ink-3">A first pull of the agent image can take several minutes; it isn't counted against the create timeout.</p>}
      {plugin.warnings.length > 0 && (
        <ul className="flex flex-col gap-1">
          {plugin.warnings.map((w) => (
            <li key={w.code} className="rounded-control border border-mari/40 bg-mari-soft px-3 py-2 text-sm text-ink">
              {w.message}
            </li>
          ))}
        </ul>
      )}
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
        <dt className="text-ink-3">Image</dt>
        <dd className="font-mono break-all text-ink">{plugin.image || "—"}</dd>
        {plugin.image_digest && (
          <>
            <dt className="text-ink-3">Digest</dt>
            <dd className="font-mono break-all text-ink-2">{plugin.image_digest}</dd>
          </>
        )}
      </dl>
      {detached ? (
        <p className="text-sm text-ink-2">The plugin that made it was uninstalled keeping its machines: Loomux can't stop, start or update it any more.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {plugin.status === "stopped" && (
            <Button size="sm" variant="primary" isPending={act.isPending && act.variables === "start"} pendingLabel="Starting…" onPress={() => act.mutate("start")}>
              Start
            </Button>
          )}
          {plugin.status === "running" && plugin.persistent && (
            <Button size="sm" isPending={act.isPending && act.variables === "stop"} pendingLabel="Stopping…" onPress={() => act.mutate("stop")}>
              Stop
            </Button>
          )}
          {(plugin.status === "error" || plugin.status === "lost") && (
            <Button size="sm" variant="primary" isPending={act.isPending && act.variables === "recreate"} pendingLabel="Retrying…" onPress={() => act.mutate("recreate")}>
              Retry
            </Button>
          )}
          {plugin.update_available && plugin.status === "running" && (
            <Button size="sm" isPending={act.isPending && act.variables === "recreate"} pendingLabel="Updating…" onPress={() => act.mutate("recreate")}>
              Update the image
            </Button>
          )}
        </div>
      )}
      {act.error && (
        <p role="alert" className="text-sm text-bad">
          {act.error instanceof Error ? act.error.message : "That didn't work."}
        </p>
      )}
    </div>
  );
}

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, type Target, type TargetAgent, type TargetTestResult, type TestStep } from "../lib/api";
import { formatRelativeTime } from "../lib/time";
import { useApiClient } from "../lib/useApiClient";
import { Button } from "../ui/Button";
import { StatusShapeIcon } from "../ui/StatusMark";

function bytes(n: number) {
  const gb = n / 1e9;
  return gb >= 1 ? `${gb >= 100 ? gb.toFixed(0) : gb.toFixed(1)} GB free` : `${Math.round(n / 1e6)} MB free`;
}

// A machine's health as the last probe saw it: reachable, how fast, its
// tmux, its disk. Shape and words, not colour alone.
export function HealthSummary({ target }: { target: Target }) {
  const h = target.health;
  if (!h) return <p className="text-sm text-ink-3">Not checked yet.</p>;
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink-2">
      <span className="inline-flex items-center gap-1.5 font-bold text-ink">
        <StatusShapeIcon shape={h.reachable ? "check" : "cross"} tone={h.reachable ? "good" : "bad"} />
        {h.reachable ? "Reachable" : "Can't be reached"}
      </span>
      {h.reachable && <span className="tabular-nums">{h.latency_ms} ms</span>}
      {h.tmux_version && <span>tmux {h.tmux_version}</span>}
      {h.disk_free_bytes != null && <span className="tabular-nums">{bytes(h.disk_free_bytes)}</span>}
      <span className="text-ink-3">checked {formatRelativeTime(h.last_probed_at)}</span>
      {h.error && <span className="basis-full text-bad">{h.error}</span>}
    </p>
  );
}

function testText(r: TargetTestResult) {
  if (r.reachable) return `Reachable${r.tmux_version ? `, tmux ${r.tmux_version}` : ""}, ${r.latency_ms} ms.`;
  if (r.host_key_problem) return "The machine's host key doesn't match what Loomux trusts. Check it below before connecting again.";
  return `Couldn't connect${r.error ? `: ${r.error}` : "."}`;
}

const STEP_NAMES: Record<string, string> = {
  connect: "Reach the machine",
  host_key: "Its host key",
  auth: "Sign in",
  tmux: "Run tmux",
};

// A connection test step by step (LOOM-138): which one failed, and why.
export function TestSteps({ steps }: { steps: TestStep[] }) {
  return (
    <ol aria-label="Connection test steps" className="flex flex-col gap-1 text-sm">
      {steps.map((s) => (
        <li key={s.name} className="flex flex-wrap items-start gap-x-2">
          <StatusShapeIcon
            shape={s.status === "ok" ? "check" : s.status === "failed" ? "cross" : "ring"}
            tone={s.status === "ok" ? "good" : s.status === "failed" ? "bad" : "muted"}
            className="mt-0.5 size-3.5"
          />
          <span className={`font-bold ${s.status === "skipped" ? "text-ink-3" : "text-ink"}`}>{STEP_NAMES[s.name] ?? s.name}</span>
          <span className="text-ink-2">{s.status === "ok" ? "ok" : s.status === "failed" ? "failed" : "not tried"}</span>
          {s.error && <span className="basis-full pl-5 text-bad">{s.error}</span>}
        </li>
      ))}
    </ol>
  );
}

function unavailable(err: unknown) {
  return err instanceof ApiError && err.status === 501;
}

// Test connection (the onboarding check) and Probe now (health and agent
// CLIs, recorded), with what each found.
export function HealthActions({ target }: { target: Target }) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["targets"] });
  const test = useMutation({ mutationFn: () => apiClient.testTarget(target.id), onSuccess: refresh });
  const probe = useMutation({ mutationFn: () => apiClient.probeTarget(target.id), onSuccess: refresh });

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" isDisabled={test.isPending} isPending={test.isPending} pendingLabel="Testing…" onPress={() => test.mutate()}>
          Test connection
        </Button>
        <Button size="sm" isDisabled={probe.isPending} isPending={probe.isPending} pendingLabel="Checking…" onPress={() => probe.mutate()}>
          Check agents and health
        </Button>
      </div>
      {test.data && (
        <div role="status" className="flex flex-col gap-2">
          <p className={`text-sm font-bold ${test.data.reachable ? "text-good" : "text-bad"}`}>
            {test.data.steps && !test.data.reachable ? "The connection test stopped here:" : testText(test.data)}
          </p>
          {test.data.steps && !test.data.reachable && <TestSteps steps={test.data.steps} />}
        </div>
      )}
      {test.isError && (
        <p role="alert" className="text-sm text-bad">
          {unavailable(test.error) ? "This server can't test connections." : `Couldn't run the test: ${(test.error as Error).message}`}
        </p>
      )}
      {probe.data && <AgentList agents={probe.data.agents} />}
      {probe.isError && (
        <p role="alert" className="text-sm text-bad">
          Couldn't check the machine: {(probe.error as Error).message}
        </p>
      )}
    </div>
  );
}

function AgentList({ agents }: { agents: TargetAgent[] }) {
  if (agents.length === 0) return <p className="text-sm text-ink-2">No agent CLIs found on this machine.</p>;
  return (
    <ul aria-label="Agents on this machine" className="flex flex-col gap-1 text-sm">
      {agents.map((a) => (
        <li key={a.agent_type} className="flex flex-wrap items-center gap-x-3">
          <StatusShapeIcon shape={a.available ? "check" : "cross"} tone={a.available ? "good" : "muted"} />
          <span className="font-bold text-ink">{a.agent_type}</span>
          <span className="text-ink-2">
            {!a.available
              ? "not installed"
              : a.auth_status === "logged_out"
                ? "installed, needs signing in on the machine"
                : `installed${a.version ? `, ${a.version}` : ""}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, type MigrateSSHResult, type Target } from "../lib/api";
import { targetFormFromTarget, toTargetRequest } from "../lib/targets";
import { useApiClient } from "../lib/useApiClient";
import { Button } from "../ui/Button";
import { CopyText } from "../ui/CopyText";
import { StatusShapeIcon } from "../ui/StatusMark";
import { TestSteps } from "./Health";

// How Loomux signs in to a remote machine (LOOM-138). A machine with a key
// of its own shows that key and what's left to get it ready; one signing in
// through the deployment's SSH config can be moved to a key of its own,
// with nothing changed on the machine.
export function SSHAccess({ target }: { target: Target }) {
  if (target.ssh_mode === "managed") return <ManagedAccess target={target} />;
  if (target.ssh_mode === "config") return <ConfigAccess target={target} />;
  return <p className="text-sm text-ink-2">Signs in the way the server's SSH config says.</p>;
}

// What a managed key may do on the machine: run commands, nothing more.
const KEY_OPTIONS = "no-port-forwarding,no-agent-forwarding,no-X11-forwarding";

const STEPS = [
  { key: "pin_host_key", label: "Trust its host key", hint: "Scan it under Host key, compare the fingerprint with the machine's own, and pin it." },
  { key: "authorize_key", label: "Let Loomux in", hint: "Add the line below to the user's ~/.ssh/authorized_keys on the machine." },
  { key: "test_connection", label: "Test the connection", hint: "Test connection, under Health." },
];

function ManagedAccess({ target }: { target: Target }) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [confirmReplace, setConfirmReplace] = useState(false);
  const replace = useMutation({
    mutationFn: () => apiClient.updateTarget(target.id, { ...toTargetRequest(targetFormFromTarget(target)), generate_ssh_key: true }),
    onSuccess: () => {
      setConfirmReplace(false);
      void queryClient.invalidateQueries({ queryKey: ["targets"] });
    },
  });
  const key = target.ssh_key;
  const current = target.ready ? STEPS.length : Math.max(0, STEPS.findIndex((s) => s.key === target.next_step));

  return (
    <div className="flex flex-col gap-4">
      <ol aria-label="Getting it ready" className="flex flex-col gap-2">
        {STEPS.map((s, i) => {
          const done = i < current;
          const now = i === current;
          return (
            <li key={s.key} aria-current={now ? "step" : undefined} className="flex items-start gap-2">
              <StatusShapeIcon shape={done ? "check" : now ? "diamond" : "ring"} tone={done ? "good" : now ? "accent" : "muted"} className="mt-1 size-3.5" />
              <span className="flex flex-col">
                <span className={`font-bold ${done || now ? "text-ink" : "text-ink-3"}`}>
                  {s.label}
                  {done && <span className="sr-only"> (done)</span>}
                </span>
                {now && <span className="text-sm text-ink-2">{s.hint}</span>}
              </span>
            </li>
          );
        })}
      </ol>
      {target.ready && (
        <p role="status" className="flex items-center gap-2 font-bold text-good">
          <StatusShapeIcon shape="check" tone="good" />
          Ready: Loomux can work here.
        </p>
      )}

      {key && key.public_key ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-2">
            On <span className="font-mono text-ink">{target.host}</span>, as <span className="font-mono text-ink">{target.user}</span>, add this line to{" "}
            <span className="font-mono text-ink">~/.ssh/authorized_keys</span>:
          </p>
          <CopyText text={`${KEY_OPTIONS} ${key.public_key}`} label="Line for authorized_keys" />
          <p className="font-mono text-sm break-all text-ink-3">
            {key.type} {key.fingerprint}
          </p>
        </div>
      ) : (
        <p className="text-sm text-ink-2">This server didn't say which key the machine uses.</p>
      )}

      {!confirmReplace ? (
        <div>
          <Button size="sm" variant="quiet" onPress={() => setConfirmReplace(true)}>
            Replace key
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-card border border-line p-3">
          <p className="text-sm text-ink">
            Loomux makes a new key and stops using this one. Until you add the new line to authorized_keys, it can't sign in.
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="danger" isPending={replace.isPending} pendingLabel="Replacing…" onPress={() => replace.mutate()}>
              Replace it
            </Button>
            <Button size="sm" variant="quiet" onPress={() => setConfirmReplace(false)}>
              Keep this key
            </Button>
          </div>
        </div>
      )}
      {replace.isError && (
        <p role="alert" className="text-sm text-bad">
          Couldn't replace the key: {(replace.error as Error).message}
        </p>
      )}
    </div>
  );
}

function migrateError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 501) return "This server can't move machines to a key of their own.";
    if (err.status === 502) return `Couldn't read the server's SSH config for this machine: ${err.message}`;
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

function ConfigAccess({ target }: { target: Target }) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const check = useMutation({ mutationFn: () => apiClient.migrateSSH(target.id, { dry_run: true }) });
  const apply = useMutation({
    mutationFn: () => apiClient.migrateSSH(target.id, { dry_run: false }),
    onSettled: () => {
      setConfirm(false);
      void queryClient.invalidateQueries({ queryKey: ["targets"] });
    },
  });
  const plan = check.data?.result;
  const outcome = apply.data?.result;

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-ink-2">
        Signs in the way the server's SSH config says. Moving it to a key of its own takes the same key and host key from that config,
        so nothing changes on the machine, and then tests it; if the test fails, it stays as it is.
      </p>
      <div>
        <Button size="sm" isPending={check.isPending} pendingLabel="Checking…" onPress={() => check.mutate()}>
          Check moving it to a key of its own
        </Button>
      </div>
      {check.isError && (
        <p role="alert" className="text-sm text-bad">
          {migrateError(check.error)}
        </p>
      )}
      {plan && !outcome && <MigrationPlan result={plan} />}
      {plan && plan.can_apply && !outcome && (
        !confirm ? (
          <div>
            <Button size="sm" variant="primary" onPress={() => setConfirm(true)}>
              Move it
            </Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button size="sm" variant="primary" isPending={apply.isPending} pendingLabel="Moving and testing…" onPress={() => apply.mutate()}>
              Move and test it
            </Button>
            <Button size="sm" variant="quiet" onPress={() => setConfirm(false)}>
              Not now
            </Button>
          </div>
        )
      )}
      {apply.isError && (
        <p role="alert" className="text-sm text-bad">
          {migrateError(apply.error)}
        </p>
      )}
      {outcome && <MigrationOutcome result={outcome} />}
    </div>
  );
}

function MigrationPlan({ result }: { result: MigrateSSHResult }) {
  const p = result.plan;
  return (
    <div className="flex flex-col gap-2 rounded-card border border-line p-3 text-sm">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
        <dt className="text-ink-2">Signs in as</dt>
        <dd className="font-mono break-all text-ink">
          {p.user}@{p.host}
          {p.ssh_port && p.ssh_port !== 22 ? `:${p.ssh_port}` : ""}
        </dd>
        <dt className="text-ink-2">Through</dt>
        <dd className="text-ink">{p.ssh_proxy === "none" ? "a direct connection" : "the server's proxy"}</dd>
        {p.key && (
          <>
            <dt className="text-ink-2">With the key</dt>
            <dd className="font-mono break-all text-ink">
              {p.key.source_file}
              {p.key.fingerprint && ` (${p.key.fingerprint})`}
            </dd>
          </>
        )}
        {p.host_keys.map((k) => (
          <FragmentRow key={k.fingerprint} label="Trusting host key" value={`${k.type} ${k.fingerprint}`} />
        ))}
      </dl>
      {result.problems.length > 0 ? (
        <div role="alert" className="flex flex-col gap-1">
          <p className="font-bold text-bad">It can't be moved yet:</p>
          <ul className="list-disc pl-5 text-bad">
            {result.problems.map((pr) => (
              <li key={pr}>{pr}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="font-bold text-ink">Ready to move.</p>
      )}
    </div>
  );
}

function FragmentRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-ink-2">{label}</dt>
      <dd className="font-mono break-all text-ink">{value}</dd>
    </>
  );
}

function MigrationOutcome({ result }: { result: MigrateSSHResult }) {
  if (result.applied) {
    return (
      <p role="status" className="flex items-center gap-2 font-bold text-good">
        <StatusShapeIcon shape="check" tone="good" />
        Moved: it now signs in with a key of its own, and its test passed.
      </p>
    );
  }
  return (
    <div role="alert" className="flex flex-col gap-2 text-sm">
      <p className="font-bold text-bad">
        {result.rolled_back ? "Its test failed, so it's back on the SSH config, as before." : "It wasn't moved."}
      </p>
      {result.problems.length > 0 && (
        <ul className="list-disc pl-5 text-bad">
          {result.problems.map((pr) => (
            <li key={pr}>{pr}</li>
          ))}
        </ul>
      )}
      {result.test?.steps && <TestSteps steps={result.test.steps} />}
    </div>
  );
}

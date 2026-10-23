import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ApiError } from "../lib/api";
import {
  EMPTY_TARGET_FORM,
  formatDestination,
  targetFormFromTarget,
  toTargetRequest,
  validateTargetRequest,
  type TargetFormValues,
} from "../lib/targets";
import { machinePhase } from "../lib/plugins";
import { useApiClient } from "../lib/useApiClient";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { HealthActions, HealthSummary } from "../machines/Health";
import { HostKeys } from "../machines/HostKeys";
import { CreatedMachine } from "../machines/CreatedMachine";
import { ConnectionFields, NameField, PolicyFields, RelayFields } from "../machines/MachineForm";
import { SSHAccess } from "../machines/SSHAccess";
import { Button } from "../ui/Button";

// One machine (/machines/:id): checks and host key, which act at once, and
// its settings, saved together (the server replaces the record, so every
// field goes back). Deleting it is refused while workspaces live there.
// A machine a plugin made (LOOM-178) shows how it's doing instead of the
// host key and sign-in (the plugin's), polls while it comes up, and
// deleting it destroys it with its data and workspaces.
export function MachinePage() {
  const { id } = useParams<{ id: string }>();
  const apiClient = useApiClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const targets = useQuery({
    queryKey: ["targets"],
    queryFn: apiClient.listTargets,
    // Follow a created machine while it's on its way.
    refetchInterval: (q) => {
      const m = q.state.data?.targets.find((t) => t.id === id)?.plugin;
      return m && machinePhase(m).busy ? 3000 : false;
    },
  });
  const workspaces = useQuery({ queryKey: ["workspaces"], queryFn: apiClient.listWorkspaces });
  const target = targets.data?.targets.find((t) => t.id === id);
  useDocumentTitle(target ? target.name : "Machine");

  // The form starts from the stored record and tracks edits on top of it.
  const [edits, setEdits] = useState<Partial<TargetFormValues>>({});
  const stored = target ? targetFormFromTarget(target) : EMPTY_TARGET_FORM;
  const values = { ...stored, ...edits };
  const dirty = Object.keys(edits).some((k) => edits[k as keyof TargetFormValues] !== stored[k as keyof TargetFormValues]);
  const [formError, setFormError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const save = useMutation({
    mutationFn: () => apiClient.updateTarget(id!, toTargetRequest(values)),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["targets"] });
      setEdits({});
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : "Couldn't save."),
  });
  const remove = useMutation({
    mutationFn: () => apiClient.deleteTarget(id!),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["targets"] });
      navigate("/machines");
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(null);
    const problem = validateTargetRequest(toTargetRequest(values), { managed: target?.ssh_mode === "managed" });
    if (problem) {
      setFormError(problem);
      return;
    }
    save.mutate();
  }

  if (targets.isLoading) return <p className="px-4 py-8 text-ink-3 md:px-8">Loading…</p>;
  if (targets.isError && !targets.data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <p role="alert" className="rounded-card border border-bad/40 bg-bad-soft p-4 text-bad">
          Couldn't load this machine. Check that Loomux is reachable, then reload.
        </p>
        <Link to="/machines" className="mt-2 inline-block font-bold text-accent">
          Back to Machines
        </Link>
      </div>
    );
  }
  if (!target) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <p className="font-bold text-ink">There's no such machine.</p>
        <Link to="/machines" className="mt-2 inline-block font-bold text-accent">
          Back to Machines
        </Link>
      </div>
    );
  }

  const inUse = (workspaces.data?.workspaces ?? []).filter((w) => w.target_id === target.id).length;
  const created = target.plugin ?? null;
  const deleteError = remove.error instanceof ApiError && remove.error.status === 409
    ? created
      ? `${target.name} can't be deleted right now: ${remove.error.message}`
      : `${target.name} still has workspaces. Delete them first, on Machines.`
    : remove.error
      ? `Couldn't delete ${target.name}: ${(remove.error as Error).message}`
      : null;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <Link to="/machines" className="inline-flex min-h-9 items-center text-sm font-bold text-accent">
        <span aria-hidden="true">‹&nbsp;</span>Machines
      </Link>
      <h1 className="text-[1.75rem] font-extrabold text-ink">{target.name}</h1>
      <p className="font-mono text-sm break-all text-ink-2">{formatDestination(target)}</p>

      {created && (
        <section aria-labelledby="machine" className="mt-6 flex flex-col gap-3 rounded-card border border-line bg-surface p-4 md:p-5">
          <h2 id="machine" className="text-lg font-extrabold text-ink">
            Machine
          </h2>
          <CreatedMachine target={target} plugin={created} />
        </section>
      )}

      <section aria-labelledby="health" className="mt-6 flex flex-col gap-3 rounded-card border border-line bg-surface p-4 md:p-5">
        <h2 id="health" className="text-lg font-extrabold text-ink">
          Health
        </h2>
        <HealthSummary target={target} />
        <HealthActions target={target} />
      </section>

      {target.kind === "remote" && !created && (
        <section aria-labelledby="hostkey" className="mt-5 flex flex-col gap-3 rounded-card border border-line bg-surface p-4 md:p-5">
          <h2 id="hostkey" className="text-lg font-extrabold text-ink">
            Host key
          </h2>
          <HostKeys target={target} />
        </section>
      )}

      {target.kind === "remote" && !created && (
        <section aria-labelledby="signin" className="mt-5 flex flex-col gap-3 rounded-card border border-line bg-surface p-4 md:p-5">
          <h2 id="signin" className="text-lg font-extrabold text-ink">
            Signing in
          </h2>
          <SSHAccess key={target.id} target={target} />
        </section>
      )}

      <form onSubmit={submit} aria-label={`Settings for ${target.name}`} className="mt-5 flex flex-col gap-5 pb-24">
        {created ? (
          <NameField values={values} onChange={(p) => setEdits((e) => ({ ...e, ...p }))} />
        ) : (
          <ConnectionFields values={values} onChange={(p) => setEdits((e) => ({ ...e, ...p }))} isNew={false} />
        )}
        <PolicyFields values={values} onChange={(p) => setEdits((e) => ({ ...e, ...p }))} />
        <RelayFields values={values} onChange={(p) => setEdits((e) => ({ ...e, ...p }))} />
        {formError && (
          <p role="alert" className="text-bad">
            {formError}
          </p>
        )}
        {dirty && (
          <div className="sticky bottom-[calc(var(--shell-bottom,0px)+0.75rem)] z-20 flex flex-wrap items-center gap-3 rounded-card border border-line bg-surface p-3 shadow-2">
            <span className="flex-1 font-bold text-ink">You have unsaved changes.</span>
            <Button variant="quiet" onPress={() => setEdits({})}>
              Discard
            </Button>
            <Button type="submit" variant="primary" isPending={save.isPending} pendingLabel="Saving…">
              Save changes
            </Button>
          </div>
        )}
      </form>

      <section aria-labelledby="delete-machine" className="mt-2 mb-8 flex flex-col gap-2 rounded-card border border-bad/40 p-4">
        <h2 id="delete-machine" className="font-extrabold text-ink">
          {created ? "Delete this machine" : "Remove this machine"}
        </h2>
        <p className="text-sm text-ink-2">
          {created
            ? created.status === "detached" || !created.id
              ? `Loomux forgets it${inUse > 0 ? `, with its ${inUse} workspace${inUse === 1 ? "" : "s"}` : ""}. Its plugin is gone, so the machine itself must be removed by hand.`
              : `The machine is destroyed with its data${inUse > 0 ? `, and its ${inUse} workspace${inUse === 1 ? "" : "s"} with their tasks and credentials are deleted` : ""}. This can't be undone.`
            : <>Loomux forgets it. Nothing on the machine is touched.{inUse > 0 && ` It still has ${inUse} workspace${inUse === 1 ? "" : "s"}, so the server will refuse until they're deleted.`}</>}
        </p>
        {!confirmDelete ? (
          <div>
            <Button variant="danger" onPress={() => setConfirmDelete(true)}>
              {created ? "Delete" : "Remove"} {target.name}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" isPending={remove.isPending} pendingLabel={created ? "Deleting…" : "Removing…"} onPress={() => remove.mutate()}>
              {created ? `Yes, destroy ${target.name}` : `Yes, remove ${target.name}`}
            </Button>
            <Button variant="quiet" onPress={() => setConfirmDelete(false)}>
              Keep it
            </Button>
          </div>
        )}
        {deleteError && (
          <p role="alert" className="text-sm text-bad">
            {deleteError}
          </p>
        )}
      </section>
    </div>
  );
}

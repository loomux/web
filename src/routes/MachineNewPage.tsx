import { useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "../lib/api";
import { Link, useNavigate } from "react-router-dom";
import { EMPTY_TARGET_FORM, toTargetRequest, validateTargetRequest, type TargetFormValues } from "../lib/targets";
import { useApiClient } from "../lib/useApiClient";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { ConnectionFields, PolicyFields, RelayFields } from "../machines/MachineForm";
import { Button } from "../ui/Button";

// Registering a machine (/machines/new). On success it opens the machine,
// where its host key can be scanned and pinned, its key authorized (one
// with a key of its own, LOOM-138) and the connection tested.
export function MachineNewPage() {
  useDocumentTitle("Register machine");
  const apiClient = useApiClient();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setValues] = useState<TargetFormValues>(EMPTY_TARGET_FORM);
  const [error, setError] = useState<string | null>(null);
  const onChange = (p: Partial<TargetFormValues>) => setValues((v) => ({ ...v, ...p }));
  // A key of its own needs a server with SSH keys (LOOM-138): an older one
  // has no /ssh-keys, and would quietly ignore the request for a key.
  const sshKeys = useQuery({ queryKey: ["ssh-keys"], queryFn: apiClient.listSSHKeys, retry: false });
  const managedAvailable = sshKeys.isSuccess;
  const values: TargetFormValues = managedAvailable ? form : { ...form, ssh_access: "config" };

  const create = useMutation({
    mutationFn: () => apiClient.createTarget(toTargetRequest(values, { isNew: true })),
    onSuccess: async (t) => {
      await queryClient.invalidateQueries({ queryKey: ["targets"] });
      navigate(`/machines/${t.id}`);
    },
    onError: (err) =>
      setError(
        err instanceof ApiError && (err.status === 503 || err.status === 501) && values.ssh_access === "managed"
          ? `This server can't keep a key for the machine (${err.message}). Choose "The server's SSH config" instead.`
          : err instanceof Error
            ? err.message
            : "Couldn't register it.",
      ),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const problem = validateTargetRequest(toTargetRequest(values, { isNew: true }));
    if (problem) {
      setError(problem);
      return;
    }
    create.mutate();
  }

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <Link to="/machines" className="inline-flex min-h-9 items-center text-sm font-bold text-accent">
        <span aria-hidden="true">‹&nbsp;</span>Machines
      </Link>
      <h1 className="text-[1.75rem] font-extrabold text-ink">Register machine</h1>
      <p className="text-ink-2">After registering, you check its host key, let it in if it uses a key of its own, and test the connection.</p>
      <form onSubmit={submit} aria-label="Register machine" className="mt-6 flex flex-col gap-5">
        <ConnectionFields values={values} onChange={onChange} isNew managedAvailable={managedAvailable} />
        <PolicyFields values={values} onChange={onChange} />
        <RelayFields values={values} onChange={onChange} />
        {error && (
          <p role="alert" className="text-bad">
            {error}
          </p>
        )}
        <div className="flex gap-3 pb-8">
          <Button
            type="submit"
            variant="primary"
            isDisabled={sshKeys.isPending}
            isPending={create.isPending}
            pendingLabel="Registering…"
          >
            Register machine
          </Button>
          <Button variant="quiet" onPress={() => navigate("/machines")}>
            Cancel
          </Button>
        </div>
      </form>
    </div>
  );
}

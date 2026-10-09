import { useId, useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, type Credential, type CredentialRequest } from "../lib/api";
import { formatRelativeTime } from "../lib/time";
import { useApiClient } from "../lib/useApiClient";
import { useDocumentTitle } from "../lib/useDocumentTitle";
import { Button } from "../ui/Button";
import { Icon } from "../ui/icons";

// The vault (server LOOM-134): secrets, like API keys and tokens, put into
// an agent's environment when it starts. Values are write-only
// (principles 8): typed into password fields, sent once, cleared from the
// page, never shown or put in a URL. The server returns names and scopes
// only, so a value can be replaced or deleted, never read.

// What the server accepts as a name: it becomes an environment variable.
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const INPUT = "min-h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface-2 px-3 text-ink placeholder:text-ink-3";

function message(err: unknown) {
  if (err instanceof ApiError && err.status === 404) return "This server has no vault set up.";
  return err instanceof Error ? err.message : "Something went wrong.";
}

function AddForm({ workspaces, onDone }: { workspaces: { id: string; name: string }[]; onDone: () => void }) {
  const id = useId();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [workspace, setWorkspace] = useState("");
  const [agent, setAgent] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: (body: CredentialRequest) => apiClient.createCredential(body),
    onSuccess: () => {
      setValue("");
      void queryClient.invalidateQueries({ queryKey: ["credentials"] });
      onDone();
    },
    onError: (err) => {
      // A refusal (bad name, duplicate) keeps the value to retry; a server
      // failure clears it, so a secret doesn't sit in the page.
      if (!(err instanceof ApiError) || err.status >= 500) setValue("");
      setError(message(err));
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    const body: CredentialRequest = { name: name.trim(), value };
    if (workspace) body.workspace_id = workspace;
    if (agent.trim()) body.agent_type = agent.trim();
    if (!NAME_PATTERN.test(body.name)) {
      setError("The name becomes an environment variable: letters, digits and underscores, not starting with a digit.");
      return;
    }
    if (!body.value) {
      setError("Enter the secret's value.");
      return;
    }
    setError(null);
    create.mutate(body);
  }

  return (
    <form onSubmit={submit} aria-label="Add credential" className="flex flex-col gap-4 rounded-card border border-line bg-surface p-4 shadow-1 md:p-5">
      <h2 className="text-lg font-extrabold text-ink">Add credential</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-name`} className="font-bold text-ink">
            Name (environment variable)
          </label>
          <input
            id={`${id}-name`}
            className={`${INPUT} font-mono`}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="GITHUB_TOKEN"
            autoCapitalize="characters"
            spellCheck={false}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-value`} className="font-bold text-ink">
            Value
          </label>
          <input
            id={`${id}-value`}
            type="password"
            autoComplete="off"
            className={INPUT}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <p className="text-sm text-ink-3">Never shown again once saved.</p>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-ws`} className="font-bold text-ink">
            Only for workspace (optional)
          </label>
          <select id={`${id}-ws`} className={INPUT} value={workspace} onChange={(e) => setWorkspace(e.target.value)}>
            <option value="">Any workspace</option>
            {workspaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-agent`} className="font-bold text-ink">
            Only for agent (optional)
          </label>
          <input id={`${id}-agent`} className={INPUT} value={agent} onChange={(e) => setAgent(e.target.value)} placeholder="claude-code" />
        </div>
      </div>
      {error && (
        <p role="alert" className="text-bad">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" variant="primary" isPending={create.isPending} pendingLabel="Saving…">
          Save
        </Button>
        <Button variant="quiet" onPress={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function CredentialRow({ c, scope }: { c: Credential; scope: string }) {
  const id = useId();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [replacing, setReplacing] = useState(false);
  const [value, setValue] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["credentials"] });

  const replace = useMutation({
    mutationFn: () => apiClient.setCredentialValue(c.id, value),
    onSuccess: () => {
      setValue("");
      setReplacing(false);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: () => apiClient.deleteCredential(c.id), onSuccess: refresh });
  const failure = replace.error ?? remove.error;

  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-mono font-bold break-all text-ink">{c.name}</p>
          <p className="text-sm text-ink-2">
            {scope}. Updated {formatRelativeTime(c.updated_at)}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!replacing && (
            <Button size="sm" onPress={() => setReplacing(true)}>
              Replace value
            </Button>
          )}
          {!confirmDelete && (
            <Button size="sm" variant="danger" onPress={() => setConfirmDelete(true)}>
              Delete
            </Button>
          )}
        </div>
      </div>
      {replacing && (
        <form
          aria-label={`New value for ${c.name}`}
          onSubmit={(e) => {
            e.preventDefault();
            if (value) replace.mutate();
          }}
          className="flex flex-wrap items-end gap-2"
        >
          <div className="flex min-w-0 flex-1 basis-56 flex-col gap-1">
            <label htmlFor={`${id}-new`} className="text-sm font-bold text-ink">
              New value
            </label>
            <input id={`${id}-new`} type="password" autoComplete="off" className={INPUT} value={value} onChange={(e) => setValue(e.target.value)} />
          </div>
          <Button type="submit" variant="primary" isDisabled={!value} isPending={replace.isPending} pendingLabel="Saving…">
            Save
          </Button>
          <Button
            variant="quiet"
            onPress={() => {
              setValue("");
              setReplacing(false);
            }}
          >
            Cancel
          </Button>
        </form>
      )}
      {confirmDelete && (
        <div className="flex flex-wrap items-center gap-2 rounded-control border border-bad/40 bg-bad-soft p-3 text-sm">
          <span className="text-ink">Agents that start after this won't get it.</span>
          <Button size="sm" variant="danger" isDisabled={remove.isPending} isPending={remove.isPending} pendingLabel="Deleting…" onPress={() => remove.mutate()}>
            Delete {c.name}
          </Button>
          <Button size="sm" variant="quiet" onPress={() => setConfirmDelete(false)}>
            Keep
          </Button>
        </div>
      )}
      {failure && (
        <p role="alert" className="text-sm text-bad">
          {message(failure)}
        </p>
      )}
    </li>
  );
}

export function VaultPage() {
  useDocumentTitle("Vault");
  const apiClient = useApiClient();
  const [adding, setAdding] = useState(false);
  const { data, isLoading, error } = useQuery({ queryKey: ["credentials"], queryFn: apiClient.listCredentials });
  const { data: workspacesData } = useQuery({ queryKey: ["workspaces"], queryFn: apiClient.listWorkspaces });
  const workspaces = useMemo(
    () => [...(workspacesData?.workspaces ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [workspacesData],
  );
  const names = useMemo(() => new Map(workspaces.map((w) => [w.id, w.name] as const)), [workspaces]);
  const scopeOf = (c: Credential) => {
    if (c.workspace_id && !names.has(c.workspace_id)) return "Only in a deleted workspace, so no agent gets it. You can delete it";
    const ws = c.workspace_id ? `Only in ${names.get(c.workspace_id)}` : "";
    const ag = c.agent_type ? `only for ${c.agent_type}` : "";
    if (ws && ag) return `${ws}, ${ag}`;
    if (ws) return ws;
    if (ag) return `For ${c.agent_type} only`;
    return "Every workspace and agent";
  };
  const credentials = [...(data?.credentials ?? [])].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-5 md:px-8 md:py-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-[1.75rem] font-extrabold text-ink">Vault</h1>
          <p className="max-w-prose text-ink-2">
            Secrets your agents get as environment variables when they start. Once saved, a value can be replaced or
            deleted, but never shown.
          </p>
        </div>
        {!adding && (
          <Button variant="primary" onPress={() => setAdding(true)}>
            <Icon name="plus" />
            Add credential
          </Button>
        )}
      </header>

      {adding && (
        <div className="mt-6">
          <AddForm workspaces={workspaces} onDone={() => setAdding(false)} />
        </div>
      )}

      <section aria-label="Credentials" className="mt-6">
        {isLoading && <p className="text-ink-3">Loading…</p>}
        {error ? (
          <p role="alert" className="rounded-card border border-bad/40 bg-bad-soft p-4 text-bad">
            Couldn't load the vault: {message(error)}
          </p>
        ) : null}
        {data && credentials.length === 0 && !adding && (
          <div className="rounded-card border border-dashed border-line px-5 py-8 text-center">
            <p className="font-bold text-ink">No credentials yet.</p>
            <p className="mt-1 text-ink-2">Add the tokens your agents need, like GITHUB_TOKEN, once; they get them every time they start.</p>
          </div>
        )}
        {credentials.length > 0 && (
          <ul className="divide-y divide-line rounded-card border border-line bg-surface px-4">
            {credentials.map((c) => (
              <CredentialRow key={c.id} c={c} scope={scopeOf(c)} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

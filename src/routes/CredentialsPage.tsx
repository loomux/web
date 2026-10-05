import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Credential, CredentialRequest } from "../lib/api";
import { useApiClient } from "../lib/useApiClient";

// The credential vault (server LOOM-134): secrets — API keys, tokens —
// injected into an agent's environment when it launches. Values go in and
// never come back: the server returns names and scopes only, so this page
// can replace a value but never show one.

const INPUT_CLASSES =
  "w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const PRIMARY_BUTTON_CLASSES =
  "rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900";

// What the server accepts as a name: it becomes an environment variable.
const NAME_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

const EMPTY_FORM: CredentialRequest = { name: "", value: "", workspace_id: "", agent_type: "" };

export function CredentialsPage() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState<CredentialRequest>(EMPTY_FORM);
  const [formError, setFormError] = useState<string | null>(null);
  // The row whose value is being replaced, and the new value typed so far.
  const [rotating, setRotating] = useState<{ id: string; value: string } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);

  const { data, isLoading, error } = useQuery({ queryKey: ["credentials"], queryFn: apiClient.listCredentials });
  const { data: workspacesData } = useQuery({ queryKey: ["workspaces"], queryFn: apiClient.listWorkspaces });
  const workspaceNames = useMemo(
    () => new Map((workspacesData?.workspaces ?? []).map((w) => [w.id, w.name])),
    [workspacesData],
  );

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["credentials"] });

  const createMutation = useMutation({
    mutationFn: (body: CredentialRequest) => apiClient.createCredential(body),
    onSuccess: () => {
      refresh();
      setAdding(false);
      setForm(EMPTY_FORM);
    },
    onError: (err) => setFormError(errorMessage(err)),
  });
  const rotateMutation = useMutation({
    mutationFn: ({ id, value }: { id: string; value: string }) => apiClient.setCredentialValue(id, value),
    onSuccess: () => {
      refresh();
      setRotating(null);
    },
    onError: (err, { id }) => setRowError({ id, message: errorMessage(err) }),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteCredential(id),
    onSuccess: () => {
      refresh();
      setConfirmDeleteId(null);
    },
    onError: (err, id) => {
      setConfirmDeleteId(null);
      setRowError({ id, message: errorMessage(err) });
    },
  });

  function scopeOf(c: Credential): string {
    const parts: string[] = [];
    if (c.workspace_id) parts.push(`workspace ${workspaceNames.get(c.workspace_id) ?? c.workspace_id}`);
    if (c.agent_type) parts.push(`agent ${c.agent_type}`);
    return parts.length ? parts.join(", ") : "every workspace and agent";
  }

  function handleCreate(e: FormEvent) {
    e.preventDefault();
    const body: CredentialRequest = { name: form.name.trim(), value: form.value };
    if (form.workspace_id) body.workspace_id = form.workspace_id;
    if (form.agent_type?.trim()) body.agent_type = form.agent_type.trim();
    if (!NAME_PATTERN.test(body.name)) {
      setFormError(
        "The name becomes an environment variable: letters, digits and underscores, not starting with a digit.",
      );
      return;
    }
    if (!body.value) {
      setFormError("Enter the secret's value.");
      return;
    }
    setFormError(null);
    createMutation.mutate(body);
  }

  const credentials = data?.credentials ?? [];

  return (
    <main className="mx-auto max-w-3xl p-4">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Credentials</h1>
        {!adding && (
          <button className={PRIMARY_BUTTON_CLASSES} onClick={() => setAdding(true)}>
            Add credential
          </button>
        )}
      </div>
      <p className="mb-4 text-sm text-neutral-500">
        API keys and tokens agents get as environment variables when they start. Values are stored encrypted and can be
        replaced, but never shown again. Agents that use their own sign-in on a machine don't need one.
      </p>

      {adding && (
        <form
          onSubmit={handleCreate}
          className="mb-6 space-y-3 rounded border border-neutral-200 p-4 dark:border-neutral-800"
          aria-label="Add credential"
        >
          <label className="block text-sm">
            Name (environment variable)
            <input
              className={INPUT_CLASSES}
              value={form.name}
              placeholder="GITHUB_TOKEN"
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            Value
            <input
              className={INPUT_CLASSES}
              type="password"
              autoComplete="off"
              value={form.value}
              onChange={(e) => setForm({ ...form, value: e.target.value })}
            />
          </label>
          <label className="block text-sm">
            Only for workspace (optional)
            <select
              className={INPUT_CLASSES}
              value={form.workspace_id}
              onChange={(e) => setForm({ ...form, workspace_id: e.target.value })}
            >
              <option value="">Any workspace</option>
              {(workspacesData?.workspaces ?? []).map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            Only for agent type (optional)
            <input
              className={INPUT_CLASSES}
              value={form.agent_type}
              placeholder="claude-code"
              onChange={(e) => setForm({ ...form, agent_type: e.target.value })}
            />
          </label>
          {formError && (
            <p role="alert" className="text-sm text-red-600">
              {formError}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" className={PRIMARY_BUTTON_CLASSES} disabled={createMutation.isPending}>
              Save
            </button>
            <button
              type="button"
              className="text-sm text-neutral-500 hover:underline"
              onClick={() => {
                setAdding(false);
                setForm(EMPTY_FORM);
                setFormError(null);
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {error && (
        <p role="alert" className="text-red-600">
          Couldn't load credentials: {errorMessage(error)}
        </p>
      )}
      {!isLoading && !error && credentials.length === 0 && <p className="text-neutral-500">No credentials yet.</p>}
      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {credentials.map((c) => (
          <li key={c.id} className="py-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <code className="font-mono text-sm">{c.name}</code>
                <p className="text-xs text-neutral-500">
                  {scopeOf(c)} · updated {new Date(c.updated_at).toLocaleString()}
                </p>
              </div>
              <div className="flex gap-3 text-sm">
                <button
                  className="hover:underline"
                  onClick={() => {
                    setRotating({ id: c.id, value: "" });
                    setRowError(null);
                  }}
                >
                  Replace value
                </button>
                {confirmDeleteId === c.id ? (
                  <>
                    <button className="text-red-600 hover:underline" onClick={() => deleteMutation.mutate(c.id)}>
                      Delete {c.name}
                    </button>
                    <button className="text-neutral-500 hover:underline" onClick={() => setConfirmDeleteId(null)}>
                      Keep
                    </button>
                  </>
                ) : (
                  <button
                    className="text-red-600 hover:underline"
                    onClick={() => {
                      setConfirmDeleteId(c.id);
                      setRowError(null);
                    }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            {rotating?.id === c.id && (
              <form
                className="mt-2 flex gap-2"
                aria-label={`New value for ${c.name}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  if (rotating.value) rotateMutation.mutate(rotating);
                }}
              >
                <input
                  className={INPUT_CLASSES}
                  type="password"
                  autoComplete="off"
                  placeholder="New value"
                  aria-label="New value"
                  value={rotating.value}
                  onChange={(e) => setRotating({ id: c.id, value: e.target.value })}
                />
                <button
                  type="submit"
                  className={PRIMARY_BUTTON_CLASSES}
                  disabled={!rotating.value || rotateMutation.isPending}
                >
                  Save
                </button>
                <button
                  type="button"
                  className="text-sm text-neutral-500 hover:underline"
                  onClick={() => setRotating(null)}
                >
                  Cancel
                </button>
              </form>
            )}
            {rowError?.id === c.id && (
              <p role="alert" className="mt-1 text-sm text-red-600">
                {rowError.message}
              </p>
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

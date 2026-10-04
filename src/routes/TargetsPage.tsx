import { useMemo, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, type TargetRequest } from "../lib/api";
import { useApiClient } from "../lib/useApiClient";
import {
  compareTargets,
  EMPTY_TARGET_FORM,
  formatDestination,
  KIND_FILTER_OPTIONS,
  kindBadgeClasses,
  matchesKindFilter,
  PERMISSION_MODES,
  TARGET_KINDS,
  targetFormFromTarget,
  toTargetRequest,
  validateTargetRequest,
  type KindFilterKey,
  type PermissionMode,
  type TargetFormValues,
  type TargetKind,
} from "../lib/targets";

type FormState = { mode: "create" } | { mode: "edit"; id: string; name: string };

const INPUT_CLASSES =
  "w-full rounded border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-900";
const PRIMARY_BUTTON_CLASSES =
  "rounded bg-neutral-900 px-3 py-1.5 text-sm text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong";
}

export function TargetsPage() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<KindFilterKey>("all");
  const [form, setForm] = useState<FormState | null>(null);
  const [values, setValues] = useState<TargetFormValues>(EMPTY_TARGET_FORM);
  const [clientError, setClientError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<
    { id: string; message: string; status: number } | null
  >(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["targets"],
    queryFn: apiClient.listTargets,
  });

  // Workspaces are fetched for their target_id alone: the count tells the
  // operator up front which targets DELETE will refuse (the registry holds
  // targets↔workspaces under FK RESTRICT), instead of only finding out from
  // the 409 after clicking through.
  const { data: workspacesData } = useQuery({
    queryKey: ["workspaces"],
    queryFn: apiClient.listWorkspaces,
  });

  const workspaceCountByTarget = useMemo(() => {
    const counts = new Map<string, number>();
    workspacesData?.workspaces.forEach((ws) => {
      counts.set(ws.target_id, (counts.get(ws.target_id) ?? 0) + 1);
    });
    return counts;
  }, [workspacesData]);

  const visibleTargets = useMemo(() => {
    const targets = data?.targets ?? [];
    return [...targets]
      .filter((t) => matchesKindFilter(t.kind, filter))
      .sort(compareTargets);
  }, [data, filter]);

  const createMutation = useMutation({
    mutationFn: (body: TargetRequest) => apiClient.createTarget(body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["targets"] });
      closeForm();
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: TargetRequest }) =>
      apiClient.updateTarget(id, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["targets"] });
      closeForm();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiClient.deleteTarget(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["targets"] });
      setConfirmDeleteId(null);
      setDeleteError(null);
    },
    onError: (err: unknown, id: string) => {
      setConfirmDeleteId(null);
      setDeleteError({
        id,
        message: errorMessage(err),
        status: err instanceof ApiError ? err.status : 0,
      });
    },
  });

  function resetFormErrors() {
    setClientError(null);
    createMutation.reset();
    updateMutation.reset();
  }

  function closeForm() {
    setForm(null);
    setValues(EMPTY_TARGET_FORM);
    resetFormErrors();
  }

  function openCreate() {
    setForm({ mode: "create" });
    setValues(EMPTY_TARGET_FORM);
    resetFormErrors();
  }

  function openEdit(id: string, name: string, next: TargetFormValues) {
    setForm({ mode: "edit", id, name });
    setValues(next);
    resetFormErrors();
    setDeleteError(null);
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const body = toTargetRequest(values);
    const problem = validateTargetRequest(body);
    if (problem) {
      setClientError(problem);
      return;
    }
    resetFormErrors();
    if (form?.mode === "edit") {
      updateMutation.mutate({ id: form.id, body });
    } else {
      createMutation.mutate(body);
    }
  }

  const submitting = createMutation.isPending || updateMutation.isPending;
  const submitError =
    clientError ??
    (createMutation.error || updateMutation.error
      ? errorMessage(createMutation.error ?? updateMutation.error)
      : null);

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Targets</h1>
        <button
          onClick={form ? closeForm : openCreate}
          className={PRIMARY_BUTTON_CLASSES}
        >
          {form ? "Cancel" : "Register target"}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {KIND_FILTER_OPTIONS.map((option) => (
          <button
            key={option.key}
            onClick={() => setFilter(option.key)}
            className={
              "rounded-full border px-3 py-1 text-sm " +
              (filter === option.key
                ? "border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900"
                : "border-neutral-300 bg-white text-neutral-700 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-300")
            }
          >
            {option.label}
          </button>
        ))}
      </div>

      {form && (
        <form
          onSubmit={handleSubmit}
          aria-label={form.mode === "edit" ? `Edit ${form.name}` : "Register target"}
          className="space-y-3 rounded-lg border border-neutral-200 p-4 dark:border-neutral-800"
        >
          <h2 className="text-sm font-semibold">
            {form.mode === "edit" ? `Edit ${form.name}` : "Register a target"}
          </h2>

          <label className="block space-y-1">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">Name</span>
            <input
              value={values.name}
              onChange={(e) => setValues({ ...values, name: e.target.value })}
              className={INPUT_CLASSES}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">Kind</span>
            <select
              value={values.kind}
              onChange={(e) =>
                setValues({ ...values, kind: e.target.value as TargetKind })
              }
              className={INPUT_CLASSES}
            >
              {TARGET_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          </label>

          {/* A local target must carry neither host nor user — the server
              rejects it outright rather than clearing them (registry.Target
              .Validate), so the fields are hidden rather than just optional. */}
          {values.kind === "remote" && (
            <>
              <label className="block space-y-1">
                <span className="text-sm text-neutral-600 dark:text-neutral-400">Host</span>
                <input
                  value={values.host}
                  onChange={(e) => setValues({ ...values, host: e.target.value })}
                  className={INPUT_CLASSES}
                />
              </label>
              <label className="block space-y-1">
                <span className="text-sm text-neutral-600 dark:text-neutral-400">User</span>
                <input
                  value={values.user}
                  onChange={(e) => setValues({ ...values, user: e.target.value })}
                  className={INPUT_CLASSES}
                />
              </label>
            </>
          )}

          <label className="block space-y-1">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              SSH key reference <span className="text-neutral-400">(optional)</span>
            </span>
            <input
              value={values.ssh_key_ref}
              onChange={(e) => setValues({ ...values, ssh_key_ref: e.target.value })}
              className={INPUT_CLASSES}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">
              Workspace root <span className="text-neutral-400">(optional)</span>
            </span>
            <input
              value={values.workspace_root}
              onChange={(e) => setValues({ ...values, workspace_root: e.target.value })}
              placeholder="/home/agent/loomux-workspaces"
              className={INPUT_CLASSES}
            />
          </label>

          <label className="block space-y-1">
            <span className="text-sm text-neutral-600 dark:text-neutral-400">Permission mode</span>
            <select
              value={values.permission_mode}
              onChange={(e) =>
                setValues({ ...values, permission_mode: e.target.value as PermissionMode })
              }
              className={INPUT_CLASSES}
            >
              {PERMISSION_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <span className="block text-sm text-neutral-500">
              {PERMISSION_MODES.find((m) => m.value === values.permission_mode)?.description}
            </span>
          </label>

          {submitError && (
            <p role="alert" className="text-sm text-red-600 dark:text-red-400">
              {submitError}
            </p>
          )}

          <div className="flex gap-2">
            <button type="submit" disabled={submitting} className={PRIMARY_BUTTON_CLASSES}>
              {submitting
                ? "Saving…"
                : form.mode === "edit"
                  ? "Save changes"
                  : "Register"}
            </button>
            <button
              type="button"
              onClick={closeForm}
              className="rounded border border-neutral-300 px-3 py-1.5 text-sm dark:border-neutral-700"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-neutral-500">Loading…</p>}
      {error && <p className="text-red-600">{errorMessage(error)}</p>}
      {!isLoading && !error && visibleTargets.length === 0 && (
        <p className="text-neutral-500">
          {filter === "all"
            ? "No targets registered yet — register one above."
            : "No targets match this filter."}
        </p>
      )}

      <ul className="divide-y divide-neutral-200 dark:divide-neutral-800">
        {visibleTargets.map((target) => {
          const workspaceCount = workspaceCountByTarget.get(target.id) ?? 0;
          const rowDeleteError =
            deleteError?.id === target.id ? deleteError : null;
          return (
            <li key={target.id} className="space-y-2 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-medium">{target.name}</p>
                  <p className="truncate text-sm text-neutral-500">
                    {formatDestination(target)}
                  </p>
                  {target.permission_mode && (
                    <p className="text-sm text-neutral-500">Permissions: {target.permission_mode}</p>
                  )}
                  {workspaceCount > 0 && (
                    <p className="text-sm text-neutral-500">
                      {workspaceCount === 1
                        ? "1 workspace references this target"
                        : `${workspaceCount} workspaces reference this target`}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-sm ${kindBadgeClasses(target.kind)}`}
                  >
                    {target.kind}
                  </span>
                  <button
                    onClick={() =>
                      openEdit(target.id, target.name, targetFormFromTarget(target))
                    }
                    className="text-sm text-neutral-500 hover:underline"
                  >
                    Edit
                  </button>
                  {confirmDeleteId === target.id ? (
                    <>
                      <button
                        onClick={() => deleteMutation.mutate(target.id)}
                        disabled={deleteMutation.isPending}
                        className="text-sm text-red-600 hover:underline disabled:opacity-50 dark:text-red-400"
                      >
                        {deleteMutation.isPending ? "Deleting…" : "Confirm delete"}
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-sm text-neutral-500 hover:underline"
                      >
                        Keep
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => {
                        setConfirmDeleteId(target.id);
                        setDeleteError(null);
                      }}
                      className="text-sm text-neutral-500 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {confirmDeleteId === target.id && workspaceCount > 0 && (
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  The server will refuse this while {workspaceCount === 1 ? "a workspace" : "workspaces"} still
                  reference{workspaceCount === 1 ? "s" : ""} it. Use Edit to correct the target instead.
                </p>
              )}

              {rowDeleteError && (
                <p role="alert" className="text-sm text-red-600 dark:text-red-400">
                  Could not delete “{target.name}”: {rowDeleteError.message}
                  {rowDeleteError.status === 409 &&
                    " — remove or repoint those workspaces first, or use Edit to correct this target in place."}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

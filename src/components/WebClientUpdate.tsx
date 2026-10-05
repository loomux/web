import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, type WebRelease, type WebVersionResponse } from "../lib/api";
import { useApiClient } from "../lib/useApiClient";

function describe(rel: WebRelease | null | undefined): string {
  if (!rel) return "an unversioned build";
  return rel.subject ? `${rel.tag} (${rel.subject})` : rel.tag;
}

// LOOM-118: which web client the server serves, against the newest
// published one, with Update and Roll back. A swap only reaches this
// page after a reload, so the page then offers one.
export function WebClientUpdate({ reload = () => window.location.reload() }: { reload?: () => void }) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [swapped, setSwapped] = useState<WebRelease | null | undefined>(undefined);

  const { data, error } = useQuery({
    queryKey: ["web-version"],
    queryFn: apiClient.getWebVersion,
    retry: false,
  });

  const onSwap = (v: WebVersionResponse) => {
    setSwapped(v.current);
    queryClient.setQueryData(["web-version"], v);
  };
  const update = useMutation({ mutationFn: apiClient.updateWeb, onSuccess: onSwap });
  const rollback = useMutation({ mutationFn: apiClient.rollbackWeb, onSuccess: onSwap });
  const busy = update.isPending || rollback.isPending;
  const failure = update.error ?? rollback.error;

  // A server from before LOOM-118 has no /web/version: nothing to show.
  if (error instanceof ApiError && error.status === 404) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-neutral-500 uppercase tracking-wide">Web client</h2>
      <div className="rounded-lg border border-neutral-200 p-4 text-sm dark:border-neutral-800 space-y-2">
        {error && <p className="text-red-600">Couldn't read the web client's version: {error.message}</p>}
        {data && (
          <>
            <p>
              Running <span className="font-medium">{describe(data.current)}</span>
              <span className="text-neutral-500">
                {data.source === "installed" ? ", installed by an update" : ", from the server image"}
              </span>
            </p>
            {!data.updates_enabled && (
              <p className="text-neutral-500">Updates aren't set up on this server.</p>
            )}
            {data.latest_error && (
              <p className="text-amber-700 dark:text-amber-300">Couldn't check for updates: {data.latest_error}</p>
            )}
            {data.updates_enabled && !data.latest_error && data.latest && !data.update_available && (
              <p className="text-neutral-500">This is the newest version.</p>
            )}
            {data.update_available && data.latest && swapped === undefined && (
              <div className="flex flex-wrap items-center gap-3">
                <span>
                  <span className="font-medium">{describe(data.latest)}</span> is available.
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => update.mutate()}
                  className="rounded bg-neutral-900 px-3 py-1 text-white disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900"
                >
                  {update.isPending ? "Updating…" : "Update"}
                </button>
              </div>
            )}
            {data.previous && swapped === undefined && (
              <button
                type="button"
                disabled={busy}
                onClick={() => rollback.mutate()}
                className="text-neutral-600 underline disabled:opacity-50 dark:text-neutral-400"
              >
                {rollback.isPending ? "Rolling back…" : `Roll back to ${data.previous.tag}`}
              </button>
            )}
          </>
        )}
        {failure && <p className="text-red-600">{failure.message}</p>}
        {swapped !== undefined && (
          <div role="status" className="flex flex-wrap items-center gap-3">
            <span>
              The server now serves <span className="font-medium">{describe(swapped)}</span>. Reload to use it.
            </span>
            <button
              type="button"
              onClick={reload}
              className="rounded bg-neutral-900 px-3 py-1 text-white dark:bg-neutral-100 dark:text-neutral-900"
            >
              Reload
            </button>
          </div>
        )}
      </div>
    </section>
  );
}

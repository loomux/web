import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, type WebRelease, type WebVersionResponse } from "../lib/api";
import { useApiClient } from "../lib/useApiClient";
import { Button } from "../ui/Button";

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
    <section aria-labelledby="web-client" className="flex flex-col gap-2 rounded-card border border-line bg-surface p-5">
      <h2 id="web-client" className="text-lg font-bold text-ink">
        Web client
      </h2>
      {error && <p className="text-bad">Couldn't read the web client's version: {error.message}</p>}
      {data && (
        <>
          <p className="text-ink">
            Running <b>{describe(data.current)}</b>
            <span className="text-ink-2">
              {data.source === "installed" ? ", installed by an update" : ", from the server image"}
            </span>
          </p>
          {!data.updates_enabled && <p className="text-sm text-ink-2">Updates aren't set up on this server.</p>}
          {data.latest_error && <p className="text-sm text-mari-ink">Couldn't check for updates: {data.latest_error}</p>}
          {data.updates_enabled && !data.latest_error && data.latest && !data.update_available && (
            <p className="text-sm text-ink-2">Up to date.</p>
          )}
          {data.update_available && data.latest && swapped === undefined && (
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-ink">
                <b>{describe(data.latest)}</b> is available.
              </span>
              <Button variant="primary" size="sm" isDisabled={busy} isPending={update.isPending} pendingLabel="Updating…" onPress={() => update.mutate()}>
                Update
              </Button>
            </div>
          )}
          {data.previous && swapped === undefined && (
            <div>
              <Button variant="quiet" size="sm" isDisabled={busy} isPending={rollback.isPending} pendingLabel="Rolling back…" onPress={() => rollback.mutate()}>
                {`Roll back to ${data.previous.tag}`}
              </Button>
            </div>
          )}
        </>
      )}
      {failure && <p className="text-bad">{failure.message}</p>}
      {swapped !== undefined && (
        <div role="status" className="flex flex-wrap items-center gap-3">
          <span className="text-ink">
            The server now serves <b>{describe(swapped)}</b>. Reload to use it.
          </span>
          <Button variant="primary" size="sm" onPress={reload}>
            Reload
          </Button>
        </div>
      )}
    </section>
  );
}

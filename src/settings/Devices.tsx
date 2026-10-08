import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { LoginSession } from "../lib/api";
import { formatRelativeTime } from "../lib/time";
import { useApiClient } from "../lib/useApiClient";
import { Button } from "../ui/Button";

// Every browser and installed app signed in to this Loomux (GET /sessions),
// most recently used first, with a way to sign one out remotely: a lost
// phone, an old laptop. This device signs out with Log out instead.
function when(iso: string) {
  return new Date(iso).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" });
}

function SessionRow({ s }: { s: LoginSession }) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const revoke = useMutation({
    mutationFn: () => apiClient.deleteSession(s.id),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["sessions"] }),
  });
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 py-3">
      <div className="min-w-0">
        <p className="font-bold text-ink">{s.current ? "This device" : `Signed in ${when(s.created_at)}`}</p>
        <p className="text-sm text-ink-2">
          {s.current ? `Signed in ${when(s.created_at)}` : `Last used ${formatRelativeTime(s.last_used_at)}`}
        </p>
        {revoke.isError && (
          <p role="alert" className="text-sm text-bad">
            Couldn't sign it out: {(revoke.error as Error).message}
          </p>
        )}
      </div>
      {!s.current && (
        <Button size="sm" variant="danger" isPending={revoke.isPending} pendingLabel="Signing out…" onPress={() => revoke.mutate()}>
          Log out this device
        </Button>
      )}
    </li>
  );
}

export function Devices() {
  const apiClient = useApiClient();
  const { data, isLoading, isError } = useQuery({ queryKey: ["sessions"], queryFn: apiClient.listSessions });
  const sessions = [...(data?.sessions ?? [])].sort((a, b) => Number(b.current) - Number(a.current) || Date.parse(b.last_used_at) - Date.parse(a.last_used_at));
  return (
    <section aria-labelledby="devices" className="rounded-card border border-line bg-surface p-5">
      <h2 id="devices" className="text-lg font-bold text-ink">
        Devices
      </h2>
      <p className="mt-1 text-sm text-ink-2">Where you're signed in. A device stays signed in until it's unused for 30 days.</p>
      {isLoading && <p className="mt-3 text-ink-3">Loading…</p>}
      {isError && (
        <p role="alert" className="mt-3 text-bad">
          Couldn't list your devices.
        </p>
      )}
      {sessions.length > 0 && (
        <ul className="mt-2 divide-y divide-line">
          {sessions.map((s) => (
            <SessionRow key={s.id} s={s} />
          ))}
        </ul>
      )}
    </section>
  );
}

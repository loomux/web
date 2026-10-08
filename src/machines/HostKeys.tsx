import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, type HostKeyScan, type Target } from "../lib/api";
import { useApiClient } from "../lib/useApiClient";
import { Button } from "../ui/Button";
import { StatusShapeIcon } from "../ui/StatusMark";

// Trusting a remote machine's SSH host key (LOOM-114). A scan reads the
// keys the host offers and trusts nothing; the user compares a
// fingerprint with the machine's own and pins it explicitly, within ten
// minutes of the scan. A pinned machine is checked against its pin alone.
function scanError(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 501) return "Host key pinning isn't enabled on this server.";
    if (err.status === 502) return `Couldn't read the machine's host keys: ${err.message}`;
    if (err.status === 409) return "That scan has expired. Scan again, then pin.";
  }
  return err instanceof Error ? err.message : "Something went wrong.";
}

function useCountdown(until: string | undefined) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [until]);
  return until ? Math.max(0, Date.parse(until) - now) : 0;
}

export function HostKeys({ target }: { target: Target }) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [scan, setScan] = useState<HostKeyScan | null>(null);
  const [confirmUnpin, setConfirmUnpin] = useState(false);
  const left = useCountdown(scan?.expires_at);
  const refresh = () => void queryClient.invalidateQueries({ queryKey: ["targets"] });

  const doScan = useMutation({ mutationFn: () => apiClient.scanHostKey(target.id), onSuccess: setScan });
  const pin = useMutation({
    mutationFn: (fp: string) => apiClient.pinHostKey(target.id, fp),
    onSuccess: () => {
      setScan(null);
      refresh();
    },
  });
  const unpin = useMutation({
    mutationFn: () => apiClient.unpinHostKey(target.id),
    onSuccess: () => {
      setConfirmUnpin(false);
      refresh();
    },
  });

  const pinned = target.pinned_host_keys ?? [];
  const expired = !!scan && left === 0;
  const mins = Math.floor(left / 60_000);
  const secs = String(Math.floor((left % 60_000) / 1000)).padStart(2, "0");

  return (
    <div className="flex flex-col gap-3">
      {pinned.length > 0 ? (
        <>
          <p className="flex items-center gap-2 font-bold text-ink">
            <StatusShapeIcon shape="check" tone="good" />
            Pinned. Loomux only connects if the machine shows this key.
          </p>
          <ul className="flex flex-col gap-1">
            {pinned.map((k) => (
              <li key={k.fingerprint} className="flex flex-wrap gap-x-3 font-mono text-sm break-all text-ink-2">
                <span className="font-bold text-ink">{k.type}</span>
                {k.fingerprint}
              </li>
            ))}
          </ul>
          {!confirmUnpin ? (
            <div>
              <Button size="sm" variant="quiet" onPress={() => setConfirmUnpin(true)}>
                Unpin
              </Button>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-ink">Unpin? Loomux then trusts the machine's key in the SSH known_hosts again.</span>
              <Button size="sm" variant="danger" isPending={unpin.isPending} pendingLabel="Unpinning…" onPress={() => unpin.mutate()}>
                Yes, unpin
              </Button>
              <Button size="sm" variant="quiet" onPress={() => setConfirmUnpin(false)}>
                Keep it
              </Button>
            </div>
          )}
        </>
      ) : (
        <p className="flex items-center gap-2 font-bold text-mari-ink">
          <StatusShapeIcon shape="diamond-open" tone="mari" />
          Not pinned. Loomux trusts whatever the SSH known_hosts says for this machine.
        </p>
      )}

      {!scan && (
        <div>
          <Button size="sm" isPending={doScan.isPending} isDisabled={doScan.isPending} pendingLabel="Scanning…" onPress={() => doScan.mutate()}>
            {pinned.length > 0 ? "Scan again" : "Scan host key"}
          </Button>
        </div>
      )}

      {scan && (
        <section aria-label="Scanned host keys" className="flex flex-col gap-3 rounded-control border border-line bg-surface-2 p-3">
          <p className="text-sm text-ink-2">
            Compare a fingerprint with the one the machine itself reports (on it, run{" "}
            <code className="rounded bg-sunken px-1 font-mono text-ink">ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub</code>) before pinning
            it. {expired ? <b className="text-bad">This scan has expired; scan again.</b> : <span className="tabular-nums">Pin within {mins}:{secs}.</span>}
          </p>
          <ul className="flex flex-col gap-2">
            {scan.host_keys.map((k) => (
              <li key={k.fingerprint} className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 font-mono text-sm break-all text-ink">
                  <b>{k.type}</b> {k.fingerprint}
                </span>
                <Button
                  size="sm"
                  variant="primary"
                  isDisabled={expired || pin.isPending}
                  isPending={pin.isPending && pin.variables === k.fingerprint}
                  pendingLabel="Pinning…"
                  onPress={() => pin.mutate(k.fingerprint)}
                >
                  Pin {k.type.replace(/^ssh-/, "").toUpperCase()} key
                </Button>
              </li>
            ))}
          </ul>
          <div>
            <Button size="sm" variant="quiet" onPress={() => setScan(null)}>
              Close without pinning
            </Button>
          </div>
        </section>
      )}

      {(doScan.isError || pin.isError || unpin.isError) && (
        <p role="alert" className="text-sm text-bad">
          {scanError(doScan.error ?? pin.error ?? unpin.error)}
        </p>
      )}
    </div>
  );
}

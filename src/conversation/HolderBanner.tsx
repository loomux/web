import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError, type TaskHold } from "../lib/api";
import { heldSince, holderName } from "../lib/holds";
import { useApiClient } from "../lib/useApiClient";
import { Button } from "../ui/Button";
import { StatusShapeIcon } from "../ui/StatusMark";

// Who drives a task from a terminal (loomux/server LOOM-267), with Take
// back (docs/design/tui-client-design.md "What other clients show").

function failure(err: unknown, holder: string): string {
  if (err instanceof ApiError && err.code === "detach_failed") {
    return `Couldn't take it back: ${holder} couldn't be detached (its machine didn't answer). Nothing changed. Try again.`;
  }
  return `Couldn't take it back: ${err instanceof Error ? err.message : "the server refused"}`;
}

// Take back: a release with no hold id, which ends whoever holds the task,
// detaches their terminal and hands the agent back to Loomux. It asks
// first, since it cuts off whoever is typing there.
export function TakeBack({ hold, onTakenBack }: { hold: TaskHold; onTakenBack?: () => void }) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const holder = holderName(hold.client_kind, hold.client_label);
  const takeBack = useMutation({
    mutationFn: () => apiClient.releaseTask(hold.task_id),
    onSuccess: () => {
      setConfirm(false);
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      onTakenBack?.();
    },
  });

  if (!confirm) {
    return (
      <Button size="sm" className="self-start" onPress={() => setConfirm(true)}>
        Take back
      </Button>
    );
  }
  return (
    <div className="flex flex-col gap-2 text-sm">
      <p>{`${holder[0].toUpperCase()}${holder.slice(1)} is detached from the agent, and Loomux can send it messages again.`}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="danger" isPending={takeBack.isPending} pendingLabel="Taking it back…" onPress={() => takeBack.mutate()}>
          Yes, take it back
        </Button>
        <Button
          size="sm"
          variant="quiet"
          isDisabled={takeBack.isPending}
          onPress={() => {
            takeBack.reset();
            setConfirm(false);
          }}
        >
          Keep it there
        </Button>
      </div>
      {takeBack.isError && (
        <p role="alert" className="font-bold text-bad">
          {failure(takeBack.error, holder)}
        </p>
      )}
    </div>
  );
}

// The strip under a conversation's header while one of its tasks is held.
export function HolderBanner({ hold, onTakenBack }: { hold: TaskHold; onTakenBack?: () => void }) {
  const driven = `Driven from ${holderName(hold.client_kind, hold.client_label)}`;
  return (
    <section aria-label={driven} className="flex flex-wrap items-start gap-x-4 gap-y-2 border-b border-mari bg-mari-soft px-4 py-2.5 text-mari-ink md:px-6">
      <div className="min-w-0 flex-1 text-sm">
        <p className="flex items-center gap-2">
          <StatusShapeIcon shape="ring" tone="mari" />
          <span>
            <b>{driven}</b> since {heldSince(hold.acquired_at)}
          </span>
        </p>
        <p className="mt-0.5">Loomux won't type into it until it's given back.</p>
      </div>
      <TakeBack hold={hold} onTakenBack={onTakenBack} />
    </section>
  );
}

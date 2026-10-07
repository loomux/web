import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "./api";
import { newId } from "./id";
import { useApiClient } from "./useApiClient";

// Answering a decision from outside its conversation (the Inbox): every
// answer is the conversation's next chat message, exactly what the
// conversation page would send (ConfirmationCard, AttentionCard, Retry),
// with a fresh idempotency key. Approve and Deny name their offer, so a
// late answer to a closed offer runs nothing.
export interface Answer {
  conversationId: string;
  message: string;
  workspaceHint?: string;
  confirmationId?: string;
}

export function useAnswer() {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (a: Answer) =>
      apiClient.dispatch(a.conversationId, a.message, a.workspaceHint, newId(), a.confirmationId),
    onSettled: (_data, _err, a) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["conversation", a.conversationId] });
    },
  });
}

// Why an answer didn't go, in the interface's words; the server's text
// stays available behind Details.
export function answerErrorText(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 409 || err.code === "conversation_busy") {
      return "A turn is already running in this conversation, so your answer wasn't sent. Open it to follow along, and answer once it ends.";
    }
    if (err.status === 503) return "Loomux is restarting, so your answer wasn't sent. Try again in a moment.";
  }
  return "Your answer wasn't sent.";
}

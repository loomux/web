import { useCallback, useMemo } from "react";
import { api, ApiError, type TargetRequest } from "./api";
import { useAuth } from "./auth";

// Binds every token-requiring `api` call to the current session token and
// routes a 401 through handleUnauthorized (clears the stale token, which
// ProtectedRoute reacts to by redirecting to /login) before rethrowing —
// see docs/design/web-client-design.md "Auth flow": "A 401 from any call
// clears the stored token and redirects to /login."
export function useApiClient() {
  const { token, handleUnauthorized } = useAuth();

  const guarded = useCallback(
    async <T>(fn: (token: string) => Promise<T>): Promise<T> => {
      if (!token) throw new ApiError(401, "not logged in");
      try {
        return await fn(token);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          handleUnauthorized();
        }
        throw err;
      }
    },
    [token, handleUnauthorized],
  );

  return useMemo(
    () => ({
      dispatch: (
        conversationId: string,
        message: string,
        workspaceHint?: string,
        idempotencyKey?: string,
        confirmationId?: string,
      ) => guarded((t) => api.dispatch(t, conversationId, message, workspaceHint, idempotencyKey, confirmationId)),
      getDispatch: (id: string) => guarded((t) => api.getDispatch(t, id)),
      cancelDispatch: (id: string) => guarded((t) => api.cancelDispatch(t, id)),
      listWorkspaces: () => guarded((t) => api.listWorkspaces(t)),
      deleteWorkspace: (id: string) => guarded((t) => api.deleteWorkspace(t, id)),
      setWorkspaceStatus: (id: string, status: "idle" | "archived") =>
        guarded((t) => api.setWorkspaceStatus(t, id, status)),
      listConversations: () => guarded((t) => api.listConversations(t)),
      listTargets: () => guarded((t) => api.listTargets(t)),
      createTarget: (body: TargetRequest) => guarded((t) => api.createTarget(t, body)),
      updateTarget: (id: string, body: TargetRequest) =>
        guarded((t) => api.updateTarget(t, id, body)),
      deleteTarget: (id: string) => guarded((t) => api.deleteTarget(t, id)),
      getConversation: (id: string) => guarded((t) => api.getConversation(t, id)),
      getAttachInfo: (taskId: string) => guarded((t) => api.getAttachInfo(t, taskId)),
      getWebVersion: () => guarded((t) => api.getWebVersion(t)),
      updateWeb: () => guarded((t) => api.updateWeb(t)),
      rollbackWeb: () => guarded((t) => api.rollbackWeb(t)),
    }),
    [guarded],
  );
}

import { useCallback, useMemo } from "react";
import { api, ApiError, type CredentialRequest, type RouterTierRequest, type TargetRequest } from "./api";
import { useAuth } from "./authContext";

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
      listCredentials: () => guarded((t) => api.listCredentials(t)),
      createCredential: (body: CredentialRequest) => guarded((t) => api.createCredential(t, body)),
      setCredentialValue: (id: string, value: string) => guarded((t) => api.setCredentialValue(t, id, value)),
      deleteCredential: (id: string) => guarded((t) => api.deleteCredential(t, id)),
      getConversation: (id: string) => guarded((t) => api.getConversation(t, id)),
      getAttachInfo: (taskId: string) => guarded((t) => api.getAttachInfo(t, taskId)),
      getTaskTranscript: (taskId: string, page?: { limit?: number; before?: string }) =>
        guarded((t) => api.getTaskTranscript(t, taskId, page)),
      getConversationEvents: (id: string) => guarded((t) => api.getConversationEvents(t, id)),
      scanHostKey: (targetId: string) => guarded((t) => api.scanHostKey(t, targetId)),
      pinHostKey: (targetId: string, fingerprint: string) => guarded((t) => api.pinHostKey(t, targetId, fingerprint)),
      unpinHostKey: (targetId: string) => guarded((t) => api.unpinHostKey(t, targetId)),
      testTarget: (targetId: string) => guarded((t) => api.testTarget(t, targetId)),
      probeTarget: (targetId: string) => guarded((t) => api.probeTarget(t, targetId)),
      listSSHKeys: () => guarded((t) => api.listSSHKeys(t)),
      createSSHKey: (name: string) => guarded((t) => api.createSSHKey(t, name)),
      deleteSSHKey: (id: string) => guarded((t) => api.deleteSSHKey(t, id)),
      migrateSSH: (targetId: string, body: { dry_run: boolean; key_file?: string }) =>
        guarded((t) => api.migrateSSH(t, targetId, body)),
      getTaskPane: (taskId: string, since?: string) => guarded((t) => api.getTaskPane(t, taskId, since)),
      getRouterSettings: () => guarded((t) => api.getRouterSettings(t)),
      setRouterTier: (tier: string, body: RouterTierRequest) => guarded((t) => api.setRouterTier(t, tier, body)),
      clearRouterTier: (tier: string) => guarded((t) => api.clearRouterTier(t, tier)),
      testRouterTier: (tier: string) => guarded((t) => api.testRouterTier(t, tier)),
      listRouterSettingsChanges: () => guarded((t) => api.listRouterSettingsChanges(t)),
      listSessions: () => guarded((t) => api.listSessions(t)),
      deleteSession: (id: string) => guarded((t) => api.deleteSession(t, id)),
      getDeepHealth: () => guarded((t) => api.getDeepHealth(t)),
      getWebVersion: () => guarded((t) => api.getWebVersion(t)),
      updateWeb: () => guarded((t) => api.updateWeb(t)),
      rollbackWeb: () => guarded((t) => api.rollbackWeb(t)),
    }),
    [guarded],
  );
}

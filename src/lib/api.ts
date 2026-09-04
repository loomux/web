// Typed client for the Phase A API (loomux-server: docs/design/core-design.md
// §9, §10 axis 1; api/server.go). Every shape here mirrors a DTO defined in
// that package exactly — see docs/design/web-client-design.md "API surface
// consumed" for the source of truth this was written against.

const API_BASE = "/api/v1";

export class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

interface ErrorResponse {
  error: string;
}

async function request<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = (await res.json()) as ErrorResponse;
      if (body.error) message = body.error;
    } catch {
      // body wasn't JSON (or was empty) — fall back to statusText
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  target_id: string;
  status: string;
}

export interface ConversationSummary {
  conversation_id: string;
  workspace_id: string;
  status: string;
  updated_at: string;
}

export interface ConversationTask {
  id: string;
  workspace_id: string;
  kind: string;
  agent_type: string;
  status: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface AttachTargetInfo {
  id: string;
  name: string;
  kind: string;
  host: string;
  user: string;
}

export interface AttachInfoResponse {
  task_id: string;
  tmux_session: string;
  target: AttachTargetInfo;
}

export interface TaskUpdateEvent {
  task_id: string;
  workspace_id: string;
  status: string;
  updated_at: string;
}

export interface VersionResponse {
  server_version: string;
  api_version: string;
}

export const api = {
  login: (password: string) =>
    request<{ token: string }>("/login", null, {
      method: "POST",
      body: JSON.stringify({ password }),
    }),

  logout: (token: string) =>
    request<void>("/logout", token, { method: "POST" }),

  dispatch: (token: string, conversationId: string, message: string) =>
    request<{ reply: string }>("/dispatch", token, {
      method: "POST",
      body: JSON.stringify({ conversation_id: conversationId, message }),
    }),

  listWorkspaces: (token: string) =>
    request<{ workspaces: WorkspaceSummary[] }>("/workspaces", token),

  listConversations: (token: string) =>
    request<{ conversations: ConversationSummary[] }>("/conversations", token),

  getConversation: (token: string, id: string) =>
    request<{ conversation_id: string; tasks: ConversationTask[] }>(
      `/conversations/${id}`,
      token,
    ),

  getAttachInfo: (token: string, taskId: string) =>
    request<AttachInfoResponse>(`/tasks/${taskId}/attach-info`, token),

  getVersion: () => request<VersionResponse>("/version", null),
};

// streamUrl is exported for useConversationStream (lib/stream.ts) rather
// than folded into `api` above, since fetchEventSource takes a URL string,
// not a fetch call this module's `request` wrapper can drive.
export function streamUrl(conversationId: string): string {
  return `${API_BASE}/conversations/${conversationId}/stream`;
}

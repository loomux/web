// Typed client for the Phase A API (loomux-server: docs/design/core-design.md
// §9, §10 axis 1; api/server.go). Every shape here mirrors a DTO defined in
// that package exactly — see docs/design/web-client-design.md "API surface
// consumed" for the source of truth this was written against.

const API_BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  // The turn already in flight, on a 409 from POST /dispatch (LOOM-80).
  dispatchId?: string;

  constructor(status: number, message: string, dispatchId?: string) {
    super(message);
    this.status = status;
    this.dispatchId = dispatchId;
  }
}

interface ErrorResponse {
  error: string;
  dispatch_id?: string;
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
    let dispatchId: string | undefined;
    try {
      const body = (await res.json()) as ErrorResponse;
      if (body.error) message = body.error;
      dispatchId = body.dispatch_id;
    } catch {
      // body wasn't JSON (or was empty) — fall back to statusText
    }
    throw new ApiError(res.status, message, dispatchId);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface WorkspaceSummary {
  id: string;
  name: string;
  target_id: string;
  status: string;
  // LOOM-44 metadata — additive, may be absent from older servers.
  tags?: string[];
  description?: string;
  capabilities?: string[];
  rolling_summary?: string;
  is_dynamic?: boolean;
  last_used_at?: string;
}

export interface ConversationSummary {
  conversation_id: string;
  workspace_id: string;
  status: string;
  updated_at: string;
  // First-message preview, added server-side in LOOM-45. Older servers may
  // omit it, so the UI falls back to the conversation_id.
  preview?: string;
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
  failure_reason?: string;
  error_class?: string;
  // The prompt a needs-attention task's agent is stopped at (LOOM-97).
  attention?: Attention;
}

// A prompt read off an agent's pane (LOOM-97): an approval, a question or
// the folder-trust dialog, with the options it lists.
export interface Attention {
  kind: "permission" | "question" | "trust" | "login";
  title?: string;
  detail?: string;
  question?: string;
  options?: { label: string; description?: string }[];
  selected: number;
}

// Per-turn message transcript, oldest first — LOOM-31.
export interface ConversationMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  task_id: string;
  // The dispatch (LOOM-80) a user message started; absent on older rows.
  dispatch_id?: string;
  created_at: string;
}

// A dispatch job (LOOM-80): one turn, run on the server whether or not
// the request that started it is still open.
export type DispatchStatus = "queued" | "running" | "succeeded" | "failed" | "interrupted";

export interface Dispatch {
  dispatch_id: string;
  conversation_id: string;
  status: DispatchStatus;
  reply?: string;
  // Raw server error text, and its stable class (registry.ErrorClass).
  error?: string;
  error_class?: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
}

// SSE `dispatch_update`: a job of this conversation changed.
export interface DispatchUpdateEvent {
  dispatch_id: string;
  status: DispatchStatus;
  reply?: string;
  error?: string;
  error_class?: string;
  updated_at: string;
}

// A registered host Loomux can run tmux sessions on — LOOM-59's
// targetResponse. `ssh_key_ref` is a vault reference, never secret material.
export interface Target {
  id: string;
  name: string;
  kind: string;
  host: string;
  user: string;
  ssh_key_ref: string;
  // LOOM-90 metadata — additive, may be absent from older servers. Empty
  // means the target's default ($HOME/loomux-workspaces).
  workspace_root?: string;
  // How much agents on this target may do without asking (server #142):
  // "", "auto", "accept-edits" or "manual". Empty is each agent's default.
  // Absent from older servers.
  permission_mode?: string;
  // The target's policy (server LOOM-89): what Loomux may do there. Absent
  // from older servers, which allow everything.
  purpose?: string;
  allowed_agent_types?: string[];
  allow_provision?: boolean;
  allow_shell?: boolean;
  require_confirmation?: boolean;
  created_at: string;
  updated_at: string;
}

// Body for POST/PUT /targets (LOOM-59's targetRequest). No `id`: the server
// mints it on create and takes it from the path on update. PUT replaces the
// record, so every field the server stores has to be sent back on an edit or
// it is cleared — see lib/targets.ts targetFormFromTarget.
export interface TargetRequest {
  name: string;
  kind: string;
  host: string;
  user: string;
  ssh_key_ref: string;
  workspace_root?: string;
  permission_mode?: string;
  purpose?: string;
  allowed_agent_types?: string[];
  allow_provision?: boolean;
  allow_shell?: boolean;
  require_confirmation?: boolean;
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
  failure_reason?: string;
  error_class?: string;
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

  // workspaceHint (LOOM-87) is the conversation's current workspace, so the
  // router can route a follow-up back to it. Advisory: the server decides.
  // Asynchronous (LOOM-80/81): the server answers 202 with the queued job,
  // and the turn's progress and result arrive on the conversation stream.
  // idempotencyKey makes a resent submit (same key) start no second turn.
  dispatch: (
    token: string,
    conversationId: string,
    message: string,
    workspaceHint?: string,
    idempotencyKey?: string,
  ) =>
    request<Dispatch>("/dispatch", token, {
      method: "POST",
      headers: {
        Prefer: "respond-async",
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: JSON.stringify({
        conversation_id: conversationId,
        message,
        ...(workspaceHint ? { workspace_hint: workspaceHint } : {}),
      }),
    }),

  listWorkspaces: (token: string) =>
    request<{ workspaces: WorkspaceSummary[] }>("/workspaces", token),

  listConversations: (token: string) =>
    request<{ conversations: ConversationSummary[] }>("/conversations", token),

  getConversation: (token: string, id: string) =>
    request<{
      conversation_id: string;
      tasks: ConversationTask[];
      messages: ConversationMessage[];
      // Absent from servers before LOOM-80.
      dispatches?: Dispatch[];
    }>(`/conversations/${id}`, token),

  getDispatch: (token: string, id: string) =>
    request<Dispatch>(`/dispatches/${id}`, token),

  // Stops a turn in flight (LOOM-99): 202 once the job has been told; it
  // then ends failed with error_class "cancelled". 409 if it had already
  // ended.
  cancelDispatch: (token: string, id: string) =>
    request<{ dispatch_id: string }>(`/dispatches/${id}/cancel`, token, { method: "POST" }),

  listTargets: (token: string) =>
    request<{ targets: Target[] }>("/targets", token),

  createTarget: (token: string, body: TargetRequest) =>
    request<Target>("/targets", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateTarget: (token: string, id: string, body: TargetRequest) =>
    request<Target>(`/targets/${id}`, token, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  // 204 No Content on success; 409 when a workspace still references it.
  deleteTarget: (token: string, id: string) =>
    request<void>(`/targets/${id}`, token, { method: "DELETE" }),

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

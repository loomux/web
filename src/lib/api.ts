// Typed client for the Phase A API (loomux-server: docs/design/core-design.md
// §9, §10 axis 1; api/server.go). Every shape here mirrors a DTO defined in
// that package exactly — see docs/design/web-client-design.md "API surface
// consumed" for the source of truth this was written against.

import { fetchEventSource } from "@microsoft/fetch-event-source";

// The only module that talks to the server: screens and hooks go through
// `api` (with useApiClient) and openConversationStream. A test
// (apiBoundary.test.ts) keeps it that way.
const API_BASE = "/api/v1";

export class ApiError extends Error {
  status: number;
  // The turn already in flight, on a 409 from POST /dispatch (LOOM-80).
  dispatchId?: string;
  // The machine-readable reason beside the message (API v1), e.g.
  // "conversation_busy", "not_found", "rate_limited",
  // "idempotency_conflict". Absent from pre-1.0 servers.
  code?: string;

  constructor(status: number, message: string, dispatchId?: string, code?: string) {
    super(message);
    this.status = status;
    this.dispatchId = dispatchId;
    this.code = code;
  }
}

interface ErrorResponse {
  error: string;
  code?: string;
  dispatch_id?: string;
}

// Task statuses are snake_case from API v1 ("awaiting_input",
// "needs_attention", "human_takeover"); pre-1.0 servers spell them in
// kebab-case ("awaiting-input", ...). Every status read from the server
// goes through here, so the rest of the client only ever sees snake_case
// whichever server it talks to.
export function normalizeStatus(s: string): string {
  return s.replaceAll("-", "_");
}

function normalizeTask<T extends { status: string }>(t: T): T {
  return typeof t.status === "string" ? { ...t, status: normalizeStatus(t.status) } : t;
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
    let code: string | undefined;
    try {
      const body = (await res.json()) as ErrorResponse;
      if (body.error) message = body.error;
      dispatchId = body.dispatch_id;
      if (typeof body.code === "string" && body.code) code = body.code;
    } catch {
      // body wasn't JSON (or was empty) — fall back to statusText
    }
    throw new ApiError(res.status, message, dispatchId, code);
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
  rolling_summary?: string;
  last_used_at?: string;
  // Why it's in its status, e.g. what made it failed (LOOM-77).
  status_reason?: string;
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
  // The prompt a needs_attention task's agent is stopped at (LOOM-97).
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

// An offer the router made and is waiting on a yes for (LOOM-123): what
// it would do, where, and how it was answered. dispatch_id is the turn
// whose reply made it.
export interface Confirmation {
  id: string;
  dispatch_id?: string;
  kind: "run_command" | "install_agent" | "clone_remote" | "policy";
  target_id?: string;
  target_name?: string;
  agent_type?: string;
  command?: string;
  // The workspace's name. API v1 calls it workspace_name; pre-1.0 servers
  // send it as `workspace`.
  workspace_name?: string;
  workspace?: string;
  git_remote?: string;
  status: "pending" | "approved" | "denied" | "expired";
  created_at: string;
  expires_at: string;
  resolved_at?: string;
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
  // The offer this message answered (an Approve or Deny), if any. A retry
  // sends it again so the server refuses it once that offer has closed.
  confirmation_id?: string;
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

// A stream's `message_added` (LOOM-121): a message was logged to the
// conversation — notably an agent's late report, after a turn it ended
// early, which no dispatch carries.
export interface MessageAddedEvent {
  message_id: string;
  task_id?: string;
  role: string;
  created_at: string;
}

// A registered host Loomux can run tmux sessions on — LOOM-59's
// targetResponse.
export interface Target {
  id: string;
  name: string;
  kind: string;
  host: string;
  user: string;
  // LOOM-90 metadata — additive, may be absent from older servers. Empty
  // means the target's default ($HOME/loomux-workspaces).
  workspace_root?: string;
  // How much agents on this target may do without asking (server #142):
  // "", "auto", "accept_edits" (pre-1.0 servers: "accept-edits") or
  // "manual". Empty is each agent's default.
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

// A credential in the vault (server LOOM-134): a secret injected into an
// agent's environment when it launches. The server never returns a value.
export interface Credential {
  id: string;
  // The environment variable it becomes.
  name: string;
  // Scope: absent means any workspace / any agent type.
  workspace_id?: string;
  agent_type?: string;
  created_at: string;
  updated_at: string;
}

export interface CredentialRequest {
  name: string;
  value: string;
  workspace_id?: string;
  agent_type?: string;
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
  // Loomux sessions live on their own tmux server (server LOOM-93), so
  // attach_command names it ("tmux -L <socket> attach -t <session>"); a
  // bare `tmux attach` doesn't find them. Absent from older servers.
  tmux_socket?: string;
  attach_command?: string;
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

// A published web bundle (loomux/web docs/release.md), LOOM-118.
export interface WebRelease {
  commit: string;
  short: string;
  tag: string;
  built_at: string;
  subject?: string;
}

// GET /web/version: the bundle served and, when updates are set up, the
// newest one published.
export interface WebVersionResponse {
  // null for an image bundle from before releases.
  current: WebRelease | null;
  source: "image" | "installed";
  previous?: WebRelease;
  latest?: WebRelease;
  latest_error?: string;
  update_available: boolean;
  updates_enabled: boolean;
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
    // The offer this message answers, from its card (LOOM-123).
    confirmationId?: string,
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
        ...(confirmationId ? { confirmation_id: confirmationId } : {}),
      }),
    }),

  listWorkspaces: (token: string) =>
    request<{ workspaces: WorkspaceSummary[] }>("/workspaces", token),

  // Deletes a workspace, its tasks and their tmux sessions (LOOM-70); the
  // files on its target are kept. 409 carries why it can't be deleted yet.
  deleteWorkspace: (token: string, id: string) =>
    request<{ sessions_not_killed: string[] }>(`/workspaces/${id}`, token, { method: "DELETE" }),

  // "idle" puts a failed or archived workspace back in service; "archived"
  // takes one out (LOOM-70).
  setWorkspaceStatus: (token: string, id: string, status: "idle" | "archived") =>
    request<void>(`/workspaces/${id}`, token, { method: "PATCH", body: JSON.stringify({ status }) }),

  listConversations: async (token: string) => {
    const res = await request<{ conversations: ConversationSummary[] }>("/conversations", token);
    return { ...res, conversations: (res.conversations ?? []).map(normalizeTask) };
  },

  getConversation: async (token: string, id: string) => {
    const res = await request<{
      conversation_id: string;
      tasks: ConversationTask[];
      messages: ConversationMessage[];
      // Absent from servers before LOOM-80.
      dispatches?: Dispatch[];
      // Absent from servers before LOOM-123.
      confirmations?: Confirmation[];
    }>(`/conversations/${id}`, token);
    return { ...res, tasks: (res.tasks ?? []).map(normalizeTask) };
  },

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

  listCredentials: (token: string) => request<{ credentials: Credential[] }>("/credentials", token),

  createCredential: (token: string, body: CredentialRequest) =>
    request<Credential>("/credentials", token, { method: "POST", body: JSON.stringify(body) }),

  // 204 No Content: the value is replaced, name and scope kept.
  setCredentialValue: (token: string, id: string, value: string) =>
    request<void>(`/credentials/${id}/value`, token, { method: "PUT", body: JSON.stringify({ value }) }),

  deleteCredential: (token: string, id: string) =>
    request<void>(`/credentials/${id}`, token, { method: "DELETE" }),

  getAttachInfo: (token: string, taskId: string) =>
    request<AttachInfoResponse>(`/tasks/${taskId}/attach-info`, token),

  getVersion: () => request<VersionResponse>("/version", null),

  // LOOM-118. 404 from a server older than it.
  getWebVersion: (token: string) => request<WebVersionResponse>("/web/version", token),
  // 409 when already up to date; 503 when updates aren't set up.
  updateWeb: (token: string) => request<WebVersionResponse>("/web/update", token, { method: "POST" }),
  // 409 when there is nothing to roll back to.
  rollbackWeb: (token: string) => request<WebVersionResponse>("/web/rollback", token, { method: "POST" }),
};

// The conversation stream (GET /conversations/{id}/stream, SSE): what it
// can say, as one union a caller switches on.
export type StreamEvent =
  | { type: "task_update"; data: TaskUpdateEvent }
  | { type: "dispatch_update"; data: DispatchUpdateEvent }
  | { type: "message_added"; data: MessageAddedEvent };

export interface StreamHandlers {
  onEvent: (event: StreamEvent) => void;
  // The stream is up / down; it reconnects on its own after a drop.
  onConnected: (connected: boolean) => void;
  // The session is no longer valid: the stream stops for good.
  onUnauthorized: () => void;
}

// openConversationStream follows a conversation's stream until the
// returned function is called. Like every other call it sends the Bearer
// token, which native EventSource can't (see docs/design/web-client-design.md
// "Real-time updates"), so it uses fetchEventSource. A drop, or the server
// ending the stream (a restart), is retried with backoff.
export function openConversationStream(token: string, conversationId: string, handlers: StreamHandlers): () => void {
  const controller = new AbortController();
  void fetchEventSource(`${API_BASE}/conversations/${conversationId}/stream`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: controller.signal,
    openWhenHidden: true,
    async onopen(res) {
      if (res.status === 401) {
        handlers.onUnauthorized();
        controller.abort();
        return;
      }
      // While Loomux restarts, the proxy in front of it answers with an
      // error page: a failed connection, retried via onerror.
      if (!res.ok) throw new Error(`stream: HTTP ${res.status}`);
      handlers.onConnected(true);
    },
    onmessage(msg) {
      if (!msg.data) return;
      if (msg.event === "task_update" || msg.event === "dispatch_update" || msg.event === "message_added") {
        let data = JSON.parse(msg.data);
        if (msg.event === "task_update" && data && typeof data === "object") data = normalizeTask(data);
        handlers.onEvent({ type: msg.event, data } as StreamEvent);
      }
    },
    onclose() {
      handlers.onConnected(false);
      // The server ending the stream (a restart, say) isn't the end of
      // the conversation: throwing hands it to onerror, which retries.
      throw new Error("stream: closed by server");
    },
    onerror(err) {
      handlers.onConnected(false);
      // Returning (rather than throwing) tells fetchEventSource to keep
      // retrying with its own backoff instead of giving up permanently.
      if (controller.signal.aborted) throw err;
    },
  });
  return () => controller.abort();
}

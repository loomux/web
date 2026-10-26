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

async function send(path: string, token: string | null, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(`${API_BASE}${path}`, { ...init, headers });
}

async function request<T>(
  path: string,
  token: string | null,
  init?: RequestInit,
): Promise<T> {
  const res = await send(path, token, init);

  if (!res.ok) throw await apiError(res);

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// A plugin call: a 422 whose body is the plugin (install or configure
// saved it, but its check failed) becomes a PluginCheckError carrying it;
// any other failure is the usual ApiError.
async function pluginRequest(path: string, token: string | null, init?: RequestInit): Promise<Plugin> {
  const res = await send(path, token, init);
  if (res.ok) return (await res.json()) as Plugin;
  if (res.status === 422) {
    const body = (await res.clone().json().catch(() => null)) as Partial<Plugin> | null;
    if (body && typeof body.id === "string" && typeof body.status === "string") throw new PluginCheckError(body as Plugin);
  }
  throw await apiError(res);
}

// The ApiError a failed response stands for: its {error} message, or the
// status text when the body isn't one.
async function apiError(res: Response): Promise<ApiError> {
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
  return new ApiError(res.status, message, dispatchId, code);
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
  // A command task's command, exit code and the end of its output.
  command?: string;
  exit_code?: number | null;
  output_tail?: string;
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
  // create_target (LOOM-216): target_name is the machine it would create
  // and command its plan on one line.
  kind: "run_command" | "install_agent" | "clone_remote" | "policy" | "create_target";
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
  // Why a yes was refused afterwards (status denied, LOOM-216): the offer
  // changed, the name was taken, the quota was reached. Absent otherwise.
  status_reason?: string;
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
  // What the router models may see of this target's work (operations.md
  // "What the router models see"): "full", "last_message", "none", or ""
  // for the purpose's default; relay_effective is what applies.
  relay?: string;
  relay_effective?: string;
  // 0: the SSH config's port.
  ssh_port?: number;
  // How Loomux signs in (LOOM-138): "managed" with a key of its own and no
  // SSH config, or "config" through the deployment's mounted SSH config.
  // Absent from older servers, which only have the latter.
  ssh_mode?: "managed" | "config";
  // A managed target's key, public parts only; null otherwise.
  ssh_key?: TargetSSHKey | null;
  // "default" (the server's proxy) or "none" (managed targets only).
  ssh_proxy?: string;
  // Ready: the latest probe after the last change reached it and ran tmux.
  // Otherwise next_step says what to do: "pin_host_key", "authorize_key"
  // or "test_connection".
  ready?: boolean;
  next_step?: string | null;
  // Host keys this target is checked against (LOOM-114); empty: the SSH
  // known_hosts.
  pinned_host_keys?: HostKey[];
  // The last health probe, null before the first.
  health?: TargetHealth | null;
  // A machine a plugin made (LOOM-178): the plugin instance and the
  // machine's state; null for a registered host. Absent from older
  // servers.
  plugin?: TargetPlugin | null;
  created_at: string;
  updated_at: string;
}

// A target's plugin object (server api/machines.go targetPluginResponse).
export interface TargetPlugin {
  // The owning plugin instance; id is "" once it was uninstalled keeping
  // its machines (status "detached").
  id: string;
  name: string;
  label: string;
  version: string;
  environment_id: string;
  // creating, starting, running, stopped, recreating, destroying, lost,
  // error or detached; status_reason says why for error, lost, detached,
  // and what is happening while one comes up ("pulling the image…").
  status: string;
  status_reason: string;
  // While the machine comes up: "image_pull" when its image is being
  // pulled (LOOM-203). Proposed for the API; today's servers only say so
  // in status_reason, which the page reads when this is absent.
  progress?: string;
  size: string;
  persistent: boolean;
  egress: string;
  image: string;
  image_digest: string;
  update_available: boolean;
  warnings: { code: string; message: string }[];
  created_at: string;
}

// POST /targets' plugin object: make the target as a machine of that
// plugin instance (LOOM-178).
export interface TargetPluginRequest {
  id: string;
  size?: string;
  persistent?: boolean;
  egress?: string;
}

// An installed plugin instance (server api/plugins.go pluginResponse).
export interface Plugin {
  id: string;
  name: string;
  label: string;
  version: string;
  available_version: string;
  protocol: string;
  source: string;
  path: string;
  // bundled, unsigned, signed:<identity> or pinned:sha256:<hex> (LOOM-218).
  trust: string;
  // installing, installed, disabled or error.
  status: string;
  status_reason: string;
  enabled: boolean;
  capabilities: string[];
  // Every setting; a secret shows as {set: boolean}, never its value.
  config: Record<string, unknown>;
  secrets_unreadable: boolean;
  check: PluginCheck | null;
  // The running instance's state (running, restarting, failed, stopped),
  // "" when none runs.
  instance: string;
  instance_reason: string;
  machines: number;
  installed_at: string;
  updated_at: string;
}

export interface PluginCheck {
  ok: boolean;
  problems: { code: string; message: string; severity: string }[];
}

// One catalog entry (server availablePluginResponse).
export interface AvailablePlugin {
  name: string;
  title: string;
  version: string;
  protocol: string;
  vendor: string;
  homepage: string;
  description: string;
  min_host_version: string;
  source: string;
  path: string;
  trust: string;
  // none (a subprocess of loomuxd's own user) or container (a sidecar).
  isolation: string;
  capabilities: string[];
  permissions: { scope: string; detail: string }[];
  config_schema: unknown;
  installed: string[];
  incompatible?: string;
  incompatible_warning?: string;
}

// What a plugin instance offers for new machines (its targets.describe).
export interface TargetsInfo {
  sizes: { name: string; cpu: string; memory: string; disk: string }[];
  persistent_default: boolean;
  egress_options: string[];
  image: string;
  max_environments: number;
  environments: number;
}

// A 422 from install or configure: the instance was saved but can't work
// (its check failed). The plugin as it is comes with it, so the page can
// show the problems and the configuration can be fixed.
export class PluginCheckError extends ApiError {
  plugin: Plugin;

  constructor(plugin: Plugin) {
    super(422, plugin.status_reason || "The plugin was saved, but its check failed.");
    this.plugin = plugin;
  }
}

export interface HostKey {
  type: string;
  fingerprint: string;
}

export interface TargetSSHKey {
  id: string;
  name: string;
  type: string;
  fingerprint: string;
  // The authorized_keys line to add on the machine.
  public_key: string;
}

// GET/POST /ssh-keys (LOOM-138): Loomux's own SSH keys, public parts only.
export interface SSHKey extends TargetSSHKey {
  // "generated", "target" (made for one machine) or "imported".
  origin: string;
  created_at: string;
  used_by: string[];
}

// POST /targets/{id}/test's per-step result (LOOM-138).
export interface TestStep {
  name: "connect" | "host_key" | "auth" | "tmux" | string;
  status: "ok" | "failed" | "skipped" | string;
  error?: string;
}

// POST /targets/{id}/migrate-ssh (LOOM-138): moving a machine off the
// deployment's SSH config to a key of Loomux's own.
export interface MigrateSSHResult {
  target_id: string;
  dry_run: boolean;
  can_apply: boolean;
  problems: string[];
  plan: {
    host: string;
    ssh_port: number;
    user: string;
    ssh_proxy: string;
    key: { type: string; fingerprint: string; source_file: string; existing_key_id: string } | null;
    host_keys: HostKey[];
  };
  applied: boolean;
  rolled_back: boolean;
  test: TargetTestResult | null;
  target: Target | null;
}

export interface TargetHealth {
  status: string;
  reachable: boolean;
  latency_ms: number;
  tmux_version: string;
  disk_free_bytes?: number | null;
  last_probed_at: string;
  error?: string;
}

// POST /targets/{id}/scan-host-key: what the host offers right now. Trusts
// nothing; a pin must name one of these before expires_at.
export interface HostKeyScan {
  target_id: string;
  host_keys: HostKey[];
  expires_at: string;
  pinned_host_keys: HostKey[];
}

// POST /targets/{id}/test: the onboarding check.
export interface TargetTestResult {
  target_id: string;
  reachable: boolean;
  tmux_version?: string;
  latency_ms: number;
  error?: string;
  host_key_problem: boolean;
  // Absent from older servers.
  steps?: TestStep[];
}

export interface TargetAgent {
  agent_type: string;
  available: boolean;
  path?: string;
  version?: string;
  auth_status?: string;
  checked_at: string;
}

// POST /targets/{id}/probe: health and agent CLIs, re-checked and recorded.
export interface TargetProbeResult {
  health: TargetHealth | null;
  agents: TargetAgent[];
}

// A router model tier (server LOOM-185, docs/design/router-settings.md):
// stored through Settings over the server's environment, or the
// environment's. The key is write-only: only its fingerprint and, for a
// long key, its last four characters ever come back.
export interface RouterTier {
  tier: "primary" | "escalation";
  // "none": escalation configured nowhere (off).
  source: "stored" | "env" | "none";
  provider?: string;
  base_url?: string;
  model?: string;
  key_fingerprint?: string;
  key_last4?: string;
  set_at?: string;
  env_configured: boolean;
  stored_unreadable: boolean;
}

export interface RouterSettings {
  providers: string[];
  tiers: RouterTier[];
}

// PUT /settings/router/{tier}: no api_key keeps the stored key, but only
// while provider and base_url stay as stored. base_url must be https
// (http only to localhost); an anthropic tier may leave it empty.
export interface RouterTierRequest {
  provider?: string;
  base_url: string;
  model: string;
  api_key?: string;
}

// A failure is described by the provider's HTTP status (absent when none
// came back) and a class, never by the provider's own response.
export interface RouterTierTest {
  ok: boolean;
  status?: number;
  error_class?: "auth_failed" | "not_found" | "bad_request" | "rate_limited" | "provider_error" | "timeout" | "unreachable";
  error?: string;
  model: string;
  source: string;
  duration_ms: number;
}

// POST /settings/router/{tier}/models (server LOOM-191): what the tier's
// provider lists. Empty means the tier's own endpoint and saved key;
// another provider or base URL needs the key being entered, which is
// used for that call only.
export interface RouterModelsRequest {
  provider?: string;
  base_url?: string;
  api_key?: string;
}

// Like RouterTierTest, a failure is its status and class only.
export interface RouterModels {
  ok: boolean;
  models: { id: string; name?: string }[];
  status?: number;
  error_class?: string;
  error?: string;
  cached: boolean;
}

export interface RouterSettingsChange {
  id: string;
  tier: string;
  action: "set" | "clear";
  fields: string[];
  actor: string;
  created_at: string;
}

// A signed-in device (GET /sessions).
export interface LoginSession {
  id: string;
  created_at: string;
  last_used_at: string;
  current: boolean;
}

// One turn of a task (GET /tasks/{id}/transcript, LOOM-91): what was sent,
// the agent's final message, and its pane at the turn's end, redacted.
export interface TranscriptTurn {
  id: string;
  user_message: string;
  agent_message: string;
  pane: string;
  created_at: string;
}

export interface TranscriptPage {
  task_id: string;
  turns: TranscriptTurn[];
  has_more: boolean;
  next_before?: string;
}

// The dispatch audit trail (GET /conversations/{id}/events, LOOM-110): the
// steps of each turn, which the Today weave and the turn rail draw.
export type ConversationEventKind =
  | "decision"
  | "command"
  | "provision"
  | "machine"
  | "offer"
  | "offer_answered"
  | "agent_turn"
  | "relay"
  | "outcome";

export interface ConversationEvent {
  id: string;
  dispatch_id?: string;
  created_at: string;
  kind: ConversationEventKind | string;
  model?: string;
  tier?: string;
  target_id?: string;
  workspace_id?: string;
  task_id?: string;
  command?: string;
  outcome?: string;
  error_class?: string;
  duration_ms: number;
  detail?: string;
}

// A task's terminal while its turn runs. Not in /api/v1 yet: the proposed
// additive endpoint (docs/design/redesign/build-plan.md §7). The client
// probes for it and falls back to the last turn's capture without it.
export interface TaskPane {
  task_id: string;
  lines: string[];
  cursor: string;
}

export interface DeepHealth {
  status: string;
  components: Record<string, { status: string; error?: string; detail?: unknown }>;
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
  relay?: string;
  ssh_port?: number;
  // LOOM-138: sign in with this Loomux key ("" back to the SSH config), or
  // with a new one made for the machine; and whether through the server's
  // proxy ("default") or not ("none").
  ssh_key_id?: string;
  generate_ssh_key?: boolean;
  ssh_proxy?: string;
  // Ask a plugin for the machine instead (create only, LOOM-178): host,
  // user, ssh_port, ssh_key_id, generate_ssh_key, ssh_proxy and
  // workspace_root must then be left out.
  plugin?: TargetPluginRequest;
}

// What POST /targets takes for a created machine: the name, the policy
// fields and the plugin object; never the connection fields.
export type MachineRequest = Omit<
  TargetRequest,
  "kind" | "host" | "user" | "workspace_root" | "ssh_port" | "ssh_key_id" | "generate_ssh_key" | "ssh_proxy"
> & { plugin: TargetPluginRequest };

export interface AttachTargetInfo {
  id: string;
  name: string;
  kind: string;
  host: string;
  user: string;
  // 0: the SSH config's port. Absent from servers that don't send it;
  // AttachCommand then takes it from the target list.
  ssh_port?: number;
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
  // device (LOOM-151): the token an earlier login on this browser got
  // back. The server throttles a known device's failed logins on their
  // own, so other people's failures can't lock this browser out.
  login: (password: string, device?: string | null) =>
    request<{ token: string; device?: string }>("/login", null, {
      method: "POST",
      body: JSON.stringify(device ? { password, device } : { password }),
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
    request<{ sessions_not_killed: string[] }>(`/workspaces/${encodeURIComponent(id)}`, token, { method: "DELETE" }),

  // "idle" puts a failed or archived workspace back in service; "archived"
  // takes one out (LOOM-70).
  setWorkspaceStatus: (token: string, id: string, status: "idle" | "archived") =>
    request<void>(`/workspaces/${encodeURIComponent(id)}`, token, { method: "PATCH", body: JSON.stringify({ status }) }),

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
    }>(`/conversations/${encodeURIComponent(id)}`, token);
    return { ...res, tasks: (res.tasks ?? []).map(normalizeTask) };
  },

  getDispatch: (token: string, id: string) =>
    request<Dispatch>(`/dispatches/${encodeURIComponent(id)}`, token),

  // Stops a turn in flight (LOOM-99): 202 once the job has been told; it
  // then ends failed with error_class "cancelled". 409 if it had already
  // ended.
  cancelDispatch: (token: string, id: string) =>
    request<{ dispatch_id: string }>(`/dispatches/${encodeURIComponent(id)}/cancel`, token, { method: "POST" }),

  // local_targets false: this server refuses targets on its own host
  // (server LOOM-183). Absent from older servers, which allow them.
  listTargets: (token: string) =>
    request<{ targets: Target[]; local_targets?: boolean }>("/targets", token),

  createTarget: (token: string, body: TargetRequest) =>
    request<Target>("/targets", token, {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateTarget: (token: string, id: string, body: TargetRequest) =>
    request<Target>(`/targets/${encodeURIComponent(id)}`, token, {
      method: "PUT",
      body: JSON.stringify(body),
    }),

  // 204 No Content on success; 409 when a workspace still references it.
  // For a created machine it cascades: its workspaces, credentials and the
  // machine itself with its data.
  deleteTarget: (token: string, id: string) =>
    request<void>(`/targets/${encodeURIComponent(id)}`, token, { method: "DELETE" }),

  getTarget: (token: string, id: string) => request<Target>(`/targets/${encodeURIComponent(id)}`, token),

  // A machine a plugin makes (LOOM-178): 201 with the target, its
  // plugin.status "creating"; it comes up in the background.
  createMachine: (token: string, body: MachineRequest) =>
    request<Target>("/targets", token, { method: "POST", body: JSON.stringify(body) }),

  // 202 with the target; 409 while a task runs there, for a stop of a
  // machine that doesn't keep its data, or when its plugin isn't running.
  startMachine: (token: string, id: string) =>
    request<Target>(`/targets/${encodeURIComponent(id)}/start`, token, { method: "POST" }),
  stopMachine: (token: string, id: string) =>
    request<Target>(`/targets/${encodeURIComponent(id)}/stop`, token, { method: "POST" }),
  recreateMachine: (token: string, id: string, size?: string) =>
    request<Target>(`/targets/${encodeURIComponent(id)}/recreate`, token, {
      method: "POST",
      body: JSON.stringify(size ? { size } : {}),
    }),

  // Plugins (LOOM-178). The routes are 404 on a server built without them.
  listAvailablePlugins: (token: string) => request<{ plugins: AvailablePlugin[] }>("/plugins/available", token),
  listPlugins: (token: string) => request<{ plugins: Plugin[] }>("/plugins", token),
  getPlugin: (token: string, id: string) => request<Plugin>(`/plugins/${encodeURIComponent(id)}`, token),
  installPlugin: (token: string, body: { plugin: string; source: string; label: string; config: Record<string, unknown> }) =>
    pluginRequest("/plugins", token, { method: "POST", body: JSON.stringify(body) }),
  // A secret left out keeps its value; "" clears it.
  setPluginConfig: (token: string, id: string, config: Record<string, unknown>) =>
    pluginRequest(`/plugins/${encodeURIComponent(id)}/config`, token, { method: "PUT", body: JSON.stringify({ config }) }),
  pluginAction: (token: string, id: string, action: "enable" | "disable" | "upgrade" | "check") =>
    pluginRequest(`/plugins/${encodeURIComponent(id)}/${action}`, token, { method: "POST" }),
  // 409 when it owns machines and targets is absent: then "destroy" (the
  // machines and their data go) or "keep" (they stay, as plain hosts).
  uninstallPlugin: (token: string, id: string, targets?: "destroy" | "keep") =>
    request<void>(`/plugins/${encodeURIComponent(id)}${targets ? `?targets=${targets}` : ""}`, token, { method: "DELETE" }),
  // What an instance offers for a new machine (its targets.describe).
  // Proposed server route; null when the server doesn't have it, so the
  // create form falls back to what the instance's configuration says.
  describeMachines: async (token: string, id: string): Promise<TargetsInfo | null> => {
    try {
      return await request<TargetsInfo>(`/plugins/${encodeURIComponent(id)}/targets`, token);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 404 || err.status === 405 || err.status === 501)) return null;
      throw err;
    }
  },

  listCredentials: (token: string) => request<{ credentials: Credential[] }>("/credentials", token),

  createCredential: (token: string, body: CredentialRequest) =>
    request<Credential>("/credentials", token, { method: "POST", body: JSON.stringify(body) }),

  // 204 No Content: the value is replaced, name and scope kept.
  setCredentialValue: (token: string, id: string, value: string) =>
    request<void>(`/credentials/${encodeURIComponent(id)}/value`, token, { method: "PUT", body: JSON.stringify({ value }) }),

  deleteCredential: (token: string, id: string) =>
    request<void>(`/credentials/${encodeURIComponent(id)}`, token, { method: "DELETE" }),

  getAttachInfo: (token: string, taskId: string) =>
    request<AttachInfoResponse>(`/tasks/${encodeURIComponent(taskId)}/attach-info`, token),

  getTaskTranscript: (token: string, taskId: string, page: { limit?: number; before?: string } = {}) => {
    const q = new URLSearchParams();
    if (page.limit) q.set("limit", String(page.limit));
    if (page.before) q.set("before", page.before);
    const qs = q.toString();
    return request<TranscriptPage>(`/tasks/${encodeURIComponent(taskId)}/transcript${qs ? `?${qs}` : ""}`, token);
  },

  getConversationEvents: (token: string, conversationId: string) =>
    request<{ conversation_id: string; events: ConversationEvent[] }>(
      `/conversations/${encodeURIComponent(conversationId)}/events`,
      token,
    ),

  scanHostKey: (token: string, targetId: string) =>
    request<HostKeyScan>(`/targets/${encodeURIComponent(targetId)}/scan-host-key`, token, { method: "POST" }),

  pinHostKey: (token: string, targetId: string, fingerprint: string) =>
    request<Target>(`/targets/${encodeURIComponent(targetId)}/pin`, token, {
      method: "POST",
      body: JSON.stringify({ fingerprint }),
    }),

  unpinHostKey: (token: string, targetId: string) =>
    request<Target>(`/targets/${encodeURIComponent(targetId)}/pin`, token, { method: "DELETE" }),

  testTarget: (token: string, targetId: string) =>
    request<TargetTestResult>(`/targets/${encodeURIComponent(targetId)}/test`, token, { method: "POST" }),

  listSSHKeys: (token: string) => request<{ ssh_keys: SSHKey[] }>("/ssh-keys", token),

  createSSHKey: (token: string, name: string) =>
    request<SSHKey>("/ssh-keys", token, { method: "POST", body: JSON.stringify({ name }) }),

  // 409 while a machine uses it.
  deleteSSHKey: (token: string, id: string) =>
    request<void>(`/ssh-keys/${encodeURIComponent(id)}`, token, { method: "DELETE" }),

  // A plan that can't be applied (409) or whose test failed and was rolled
  // back (502) is a result like any other; an {error} answer is an ApiError.
  migrateSSH: async (token: string, targetId: string, body: { dry_run: boolean; key_file?: string }) => {
    const res = await send(`/targets/${encodeURIComponent(targetId)}/migrate-ssh`, token, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (res.ok || res.status === 409 || res.status === 502 || res.status === 500) {
      const result = (await res.clone().json().catch(() => null)) as MigrateSSHResult | null;
      if (result && typeof result.target_id === "string") return { status: res.status, result };
    }
    throw await apiError(res);
  },

  probeTarget: (token: string, targetId: string) =>
    request<TargetProbeResult>(`/targets/${encodeURIComponent(targetId)}/probe`, token, { method: "POST" }),

  // null: this server has no live pane (404/405/501), or nothing changed
  // since `since` (204).
  getTaskPane: async (token: string, taskId: string, since?: string): Promise<TaskPane | null> => {
    try {
      const qs = since ? `?since=${encodeURIComponent(since)}` : "";
      return (await request<TaskPane | undefined>(`/tasks/${encodeURIComponent(taskId)}/pane${qs}`, token)) ?? null;
    } catch (err) {
      if (err instanceof ApiError && [404, 405, 501].includes(err.status)) return null;
      throw err;
    }
  },

  getRouterSettings: (token: string) => request<RouterSettings>("/settings/router", token),

  setRouterTier: (token: string, tier: string, body: RouterTierRequest) =>
    request<RouterTier>(`/settings/router/${encodeURIComponent(tier)}`, token, { method: "PUT", body: JSON.stringify(body) }),

  // 204: back to the environment's settings (escalation off without them).
  clearRouterTier: (token: string, tier: string) =>
    request<void>(`/settings/router/${encodeURIComponent(tier)}`, token, { method: "DELETE" }),

  // 200 whether or not the provider answered; ok says which. A POST so a
  // key being entered travels in the body, never the URL.
  listRouterModels: (token: string, tier: string, body: RouterModelsRequest) =>
    request<RouterModels>(`/settings/router/${encodeURIComponent(tier)}/models`, token, { method: "POST", body: JSON.stringify(body) }),

  // 200 whether or not the provider answered; ok says which.
  testRouterTier: (token: string, tier: string) =>
    request<RouterTierTest>(`/settings/router/${encodeURIComponent(tier)}/test`, token, { method: "POST" }),

  listRouterSettingsChanges: (token: string) =>
    request<{ entries: RouterSettingsChange[] }>("/settings/router/audit?limit=20", token),

  listSessions: (token: string) => request<{ sessions: LoginSession[] }>("/sessions", token),

  deleteSession: (token: string, sessionId: string) =>
    request<void>(`/sessions/${encodeURIComponent(sessionId)}`, token, { method: "DELETE" }),

  getDeepHealth: (token: string) => request<DeepHealth>("/health/deep", token),

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
  // 403 or 404: retrying won't help, so the stream stops for good.
  onRefused?: (status: number) => void;
}

// How long to wait before the next try after `failures` failed ones in a
// row: 1s, doubling, capped at 30s, give or take 20% so many tabs don't
// all come back at once.
export function streamRetryDelay(failures: number, random: () => number = Math.random): number {
  const base = Math.min(1000 * 2 ** failures, 30_000);
  return Math.round(base * (0.8 + 0.4 * random()));
}

// openConversationStream follows a conversation's stream until the
// returned function is called. Like every other call it sends the Bearer
// token, which native EventSource can't (see docs/design/web-client-design.md
// "Real-time updates"), so it uses fetchEventSource. A drop, or the server
// ending the stream (a restart), is retried with backoff (streamRetryDelay),
// which starts over once a connection opens. A hidden tab closes the
// stream and opens it again when shown; that isn't a failure.
export function openConversationStream(
  token: string,
  conversationId: string,
  handlers: StreamHandlers,
  random: () => number = Math.random,
): () => void {
  const stopped = new AbortController();
  let current: AbortController | null = null;
  let failures = 0;

  const stop = () => {
    stopped.abort();
    current?.abort();
    current = null;
    document.removeEventListener("visibilitychange", onVisibility);
  };

  const connect = () => {
    const controller = new AbortController();
    current = controller;
    void fetchEventSource(`${API_BASE}/conversations/${encodeURIComponent(conversationId)}/stream`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
      // Hidden tabs are handled here (onVisibility), not by fetchEventSource.
      openWhenHidden: true,
      async onopen(res) {
        if (res.status === 401) {
          handlers.onUnauthorized();
          stop();
          return;
        }
        if (res.status === 403 || res.status === 404) {
          handlers.onRefused?.(res.status);
          stop();
          return;
        }
        // While Loomux restarts, the proxy in front of it answers with an
        // error page: a failed connection, retried via onerror.
        if (!res.ok) throw new Error(`stream: HTTP ${res.status}`);
        failures = 0;
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
        if (controller.signal.aborted) throw err;
        handlers.onConnected(false);
        // Returning a delay (rather than throwing) tells fetchEventSource
        // to try again after it instead of giving up.
        return streamRetryDelay(failures++, random);
      },
    });
  };

  function onVisibility() {
    if (stopped.signal.aborted) return;
    if (document.hidden) {
      if (!current) return;
      current.abort();
      current = null;
      handlers.onConnected(false);
    } else if (!current) {
      connect();
    }
  }

  document.addEventListener("visibilitychange", onVisibility);
  if (!document.hidden) connect();
  return stop;
}

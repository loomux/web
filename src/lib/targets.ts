import type { Target, TargetRequest } from "./api";

export type TargetKind = "local" | "remote";

export const TARGET_KINDS: TargetKind[] = ["local", "remote"];

// registry.Target.PermissionMode's values, as the API spells them since
// its v1 freeze (snake_case; pre-1.0 servers say "accept-edits"). "" is
// each agent-type's own default (auto, today).
export type PermissionMode = "" | "auto" | "accept_edits" | "manual";

export const PERMISSION_MODES: { value: PermissionMode; label: string; description: string }[] = [
  {
    value: "",
    label: "Agent default",
    description: "Each agent's own default — automatic mode for Claude Code and Codex.",
  },
  {
    value: "auto",
    label: "Auto",
    description:
      "Routine edits and commands go ahead; anything the agent judges risky stops and asks you in the chat.",
  },
  {
    value: "accept_edits",
    label: "Accept edits",
    description: "File edits in the workspace go ahead; every command waits for your approval in the chat.",
  },
  {
    value: "manual",
    label: "Manual",
    description: "Every file edit and command waits for approval in the chat.",
  },
];

function isPermissionMode(v: string | undefined): v is PermissionMode {
  return PERMISSION_MODES.some((m) => m.value === v);
}

// normalizePermissionMode reads either spelling: "accept_edits" (the
// frozen API v1) or "accept-edits" (servers before it).
export function normalizePermissionMode(v: string | undefined): string {
  return (v ?? "").replaceAll("-", "_");
}

// wirePermissionMode is what a target request sends: the pre-1.0
// "accept-edits", which every server takes — those before the freeze
// only that, those after it both — so the form works whichever is
// deployed. Switch to "accept_edits" once no pre-freeze server remains.
function wirePermissionMode(v: PermissionMode): string {
  return v === "accept_edits" ? "accept-edits" : v;
}

// registry.TargetPolicy.Purpose; "" is personal (a stored "personal" is
// read as "", the one option the form offers for it).
export type TargetPurpose = "" | "work";

// What the router models may see of a target's work (operations.md "What
// the router models see"); "" is the purpose's default.
export type Relay = "" | "full" | "last_message" | "none";

const RELAYS: Relay[] = ["", "full", "last_message", "none"];

// The default relay for a purpose, as the server applies it: nothing for
// a work machine, everything otherwise.
export function defaultRelay(purpose: string): Exclude<Relay, ""> {
  return purpose === "work" ? "none" : "full";
}

// What the register/edit form holds. Every field is a string because they
// are all bound to text inputs; `toTargetRequest` turns this into the wire
// shape the server validates.
export interface TargetFormValues {
  name: string;
  kind: TargetKind;
  host: string;
  user: string;
  workspace_root: string;
  permission_mode: PermissionMode;
  purpose: TargetPurpose;
  // Comma-separated in the form; empty means every agent type.
  allowed_agent_types: string;
  allow_provision: boolean;
  allow_shell: boolean;
  require_confirmation: boolean;
  relay: Relay;
  // Blank: the SSH config's port.
  ssh_port: string;
  // How Loomux signs in (LOOM-138): "managed", with a key of its own and no
  // SSH config, or "config", through the deployment's mounted SSH config.
  // Chosen when registering; a config machine moves to managed by
  // migrating (Machines › the machine).
  ssh_access: "managed" | "config";
  // A managed machine: "" through the server's proxy, "none" directly.
  ssh_proxy: "" | "none";
}

export const EMPTY_TARGET_FORM: TargetFormValues = {
  name: "",
  kind: "remote",
  host: "",
  user: "",
  workspace_root: "",
  permission_mode: "",
  purpose: "",
  allowed_agent_types: "",
  allow_provision: true,
  allow_shell: true,
  require_confirmation: false,
  relay: "",
  ssh_port: "",
  ssh_access: "managed",
  ssh_proxy: "",
};

// Pre-fills the edit form from a stored row. workspace_root and the policy
// fields are carried through deliberately: PUT replaces the record
// wholesale, so a field the form drops is a field the server clears.
export function targetFormFromTarget(target: Target): TargetFormValues {
  return {
    name: target.name,
    kind: target.kind === "local" ? "local" : "remote",
    host: target.host,
    user: target.user,
    workspace_root: target.workspace_root ?? "",
    permission_mode: isPermissionMode(normalizePermissionMode(target.permission_mode))
      ? (normalizePermissionMode(target.permission_mode) as PermissionMode)
      : "",
    purpose: target.purpose === "work" ? "work" : "",
    allowed_agent_types: (target.allowed_agent_types ?? []).join(", "),
    allow_provision: target.allow_provision ?? true,
    allow_shell: target.allow_shell ?? true,
    require_confirmation: target.require_confirmation ?? false,
    relay: RELAYS.includes(target.relay as Relay) ? (target.relay as Relay) : "",
    ssh_port: target.ssh_port ? String(target.ssh_port) : "",
    ssh_access: target.ssh_mode === "managed" ? "managed" : "config",
    ssh_proxy: target.ssh_proxy === "none" ? "none" : "",
  };
}

// Mirrors api/server.go's decodeTargetRequest: the name is trimmed, and a
// local target carries neither host nor user. Blanking them here (rather
// than rejecting) is what lets switching kind to "local" in the form Just
// Work instead of tripping the server's "must be empty" rule.
//
// A managed machine (LOOM-138) asks for a key of its own when it's
// registered, and sends its proxy choice; an edit leaves ssh_key_id out,
// which keeps the key it has.
export function toTargetRequest(values: TargetFormValues, opts: { isNew?: boolean } = {}): TargetRequest {
  const local = values.kind === "local";
  const managed = !local && values.ssh_access === "managed";
  const access: Partial<TargetRequest> = managed
    ? { ...(opts.isNew ? { generate_ssh_key: true } : {}), ssh_proxy: values.ssh_proxy === "none" ? "none" : "default" }
    : {};
  return {
    ...access,
    name: values.name.trim(),
    kind: values.kind,
    host: local ? "" : values.host.trim(),
    user: local ? "" : values.user.trim(),
    workspace_root: values.workspace_root.trim(),
    permission_mode: wirePermissionMode(values.permission_mode),
    purpose: values.purpose,
    allowed_agent_types: values.allowed_agent_types
      .split(",")
      .map((a) => a.trim())
      .filter((a) => a !== ""),
    allow_provision: values.allow_provision,
    allow_shell: values.allow_shell,
    require_confirmation: values.require_confirmation,
    relay: values.relay,
    ssh_port: local || values.ssh_port.trim() === "" ? 0 : Number(values.ssh_port.trim()),
  };
}

// Mirrors Go's path.Clean for the absolute-path case, which is the only
// case validateTargetRequest calls it in.
function cleanAbsPath(p: string): string {
  const out: string[] = [];
  for (const segment of p.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") {
      out.pop();
      continue;
    }
    out.push(segment);
  }
  return "/" + out.join("/");
}

// Mirrors registry.Target.Validate, rule for rule and message for message,
// so the client rejects what the server would reject and the operator sees
// the same wording either way. Returns null when the request is valid.
// Mirrors registry.validManagedHost: a managed machine's host is its real
// name or address (no SSH config alias resolves it, and ssh puts it into
// the proxy command), so only an RFC 1123 host name or an IP address.
export function validManagedHost(host: string): boolean {
  if (validIP(host)) return true;
  if (host.length === 0 || host.length > 253) return false;
  return host.split(".").every((label) => /^[A-Za-z0-9]([A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/.test(label));
}

function validIP(host: string): boolean {
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return host.split(".").every((o) => Number(o) <= 255 && String(Number(o)) === o);
  if (!host.includes(":") || !/^[0-9A-Fa-f:.]+$/.test(host)) return false;
  try {
    new URL(`http://[${host}]/`);
    return true;
  } catch {
    return false;
  }
}

// opts.managed: an edit of a managed machine, whose request doesn't say so.
export function validateTargetRequest(req: TargetRequest, opts: { managed?: boolean } = {}): string | null {
  if (req.name.trim() === "") return "name is required";

  if (req.kind === "local") {
    if (req.host !== "" || req.user !== "") {
      return "host and user must be empty for a local target";
    }
  } else if (req.kind === "remote") {
    if (req.host === "" || req.user === "") {
      return "host and user are required for a remote target";
    }
  } else {
    return 'kind must be "local" or "remote"';
  }

  const managed = opts.managed || req.generate_ssh_key === true || !!req.ssh_key_id;
  if (managed && req.kind === "remote" && !validManagedHost(req.host)) {
    return "host must be a host name (letters, digits and -, dot-separated) or an IP address for a target with a Loomux SSH key";
  }

  if (!isPermissionMode(normalizePermissionMode(req.permission_mode))) {
    return 'permission_mode must be empty, "auto", "accept_edits" or "manual"';
  }

  const port = req.ssh_port ?? 0;
  if (!Number.isInteger(port) || port < 0 || port > 65535) return "ssh_port must be blank, or a number from 1 to 65535";

  if (req.relay !== undefined && !RELAYS.includes(req.relay as Relay)) {
    return 'relay must be empty, "full", "last_message" or "none"';
  }

  const root = req.workspace_root ?? "";
  if (root !== "") {
    if (!root.startsWith("/")) return "workspace_root must be an absolute path";
    if (cleanAbsPath(root) !== root) {
      return "workspace_root must be a clean path (no ., .. or trailing /)";
    }
    if (root === "/") return "workspace_root must not be /";
  }

  return null;
}

// Targets carry no status, so there is no urgency to rank by: the useful
// order for scanning a registry is alphabetical, with id as a stable
// tie-breaker for same-named rows the server would have refused anyway.
export function compareTargets(
  a: Pick<Target, "name" | "id">,
  b: Pick<Target, "name" | "id">,
): number {
  const byName = a.name.localeCompare(b.name);
  return byName !== 0 ? byName : a.id.localeCompare(b.id);
}

// A one-sentence summary of a target's non-default policy, or "" for the
// default (allow everything).
export function describePolicy(target: Target): string {
  const parts: string[] = [];
  if (target.purpose === "work") parts.push("work machine");
  if (target.allow_provision === false) parts.push("no new workspaces");
  if (target.allow_shell === false) parts.push("no shell commands");
  if (target.allowed_agent_types && target.allowed_agent_types.length > 0) {
    parts.push("only " + target.allowed_agent_types.join(", "));
  }
  if (target.require_confirmation) parts.push("asks before new work");
  if (parts.length === 0) return "";
  const text = parts.join(", ");
  return `${text[0].toUpperCase()}${text.slice(1)}.`;
}

// "remote" targets read as user@host (and :port when not the SSH
// config's); a local target has no destination.
export function formatDestination(target: Pick<Target, "kind" | "host" | "user"> & { ssh_port?: number }): string {
  if (target.kind === "local") return "this host";
  const port = target.ssh_port ? `:${target.ssh_port}` : "";
  if (target.user && target.host) return `${target.user}@${target.host}${port}`;
  return (target.host || target.user || "—") + (target.host ? port : "");
}

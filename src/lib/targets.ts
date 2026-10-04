import type { Target, TargetRequest } from "./api";

export type TargetKind = "local" | "remote";

export const TARGET_KINDS: TargetKind[] = ["local", "remote"];

// registry.Target.PermissionMode's values. "" is each agent-type's own
// default (auto, today).
export type PermissionMode = "" | "auto" | "accept-edits" | "manual";

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
    value: "accept-edits",
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

export type KindFilterKey = "all" | TargetKind;

export const KIND_FILTER_OPTIONS: { key: KindFilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "remote", label: "Remote" },
  { key: "local", label: "Local" },
];

// What the register/edit form holds. Every field is a string because they
// are all bound to text inputs; `toTargetRequest` turns this into the wire
// shape the server validates.
export interface TargetFormValues {
  name: string;
  kind: TargetKind;
  host: string;
  user: string;
  ssh_key_ref: string;
  workspace_root: string;
  permission_mode: PermissionMode;
}

export const EMPTY_TARGET_FORM: TargetFormValues = {
  name: "",
  kind: "remote",
  host: "",
  user: "",
  ssh_key_ref: "",
  workspace_root: "",
  permission_mode: "",
};

// Pre-fills the edit form from a stored row. ssh_key_ref and workspace_root
// are carried through deliberately: PUT replaces the record wholesale, so a
// field the form drops is a field the server clears (api/server.go's
// targetResponse comment makes the same point about ssh_key_ref).
export function targetFormFromTarget(target: Target): TargetFormValues {
  return {
    name: target.name,
    kind: target.kind === "local" ? "local" : "remote",
    host: target.host,
    user: target.user,
    ssh_key_ref: target.ssh_key_ref,
    workspace_root: target.workspace_root ?? "",
    permission_mode: isPermissionMode(target.permission_mode) ? target.permission_mode : "",
  };
}

// Mirrors api/server.go's decodeTargetRequest: the name is trimmed, and a
// local target carries neither host nor user. Blanking them here (rather
// than rejecting) is what lets switching kind to "local" in the form Just
// Work instead of tripping the server's "must be empty" rule.
export function toTargetRequest(values: TargetFormValues): TargetRequest {
  const local = values.kind === "local";
  return {
    name: values.name.trim(),
    kind: values.kind,
    host: local ? "" : values.host.trim(),
    user: local ? "" : values.user.trim(),
    ssh_key_ref: values.ssh_key_ref.trim(),
    workspace_root: values.workspace_root.trim(),
    permission_mode: values.permission_mode,
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
export function validateTargetRequest(req: TargetRequest): string | null {
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

  if (!isPermissionMode(req.permission_mode ?? "")) {
    return 'permission_mode must be empty, "auto", "accept-edits" or "manual"';
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

export function kindBadgeClasses(kind: string): string {
  switch (kind) {
    case "remote":
      return "bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-200";
    case "local":
      return "bg-neutral-200 text-neutral-700 dark:bg-neutral-700 dark:text-neutral-200";
    default:
      return "bg-neutral-100 text-neutral-700 dark:bg-neutral-800 dark:text-neutral-300";
  }
}

// "remote" targets read as user@host; a local target has no destination.
export function formatDestination(target: Pick<Target, "kind" | "host" | "user">): string {
  if (target.kind === "local") return "this host";
  if (target.user && target.host) return `${target.user}@${target.host}`;
  return target.host || target.user || "—";
}

export function matchesKindFilter(kind: string, filter: KindFilterKey): boolean {
  return filter === "all" || kind === filter;
}

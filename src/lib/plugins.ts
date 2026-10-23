// Plain words for plugins and the machines they make (LOOM-178, server
// docs/design/target-providers.md §6), shared by the Plugins page, the
// create-machine form and the machine pages.
import type { AvailablePlugin, MachineRequest, Plugin, TargetPlugin, TargetsInfo } from "./api";
import { toTargetRequest, type TargetFormValues } from "./targets";

export type Tone = "good" | "mari" | "bad" | "muted";

// Where a plugin comes from and who vouches for it (LOOM-218 trust).
export function trustLine(trust: string): { label: string; tone: Tone } {
  if (trust === "bundled") return { label: "Part of this Loomux release", tone: "good" };
  if (trust.startsWith("signed:")) return { label: `Signed by ${trust.slice("signed:".length)}`, tone: "good" };
  if (trust.startsWith("pinned:")) return { label: `Pinned to ${trust.slice("pinned:".length, "pinned:".length + 19)}…`, tone: "good" };
  return { label: "Not signed: install only if you trust where it came from", tone: "mari" };
}

// A plugin that isn't Loomux's own needs an explicit "I trust it" before
// install (design §6).
export function needsTrustConfirmation(p: Pick<AvailablePlugin, "trust">): boolean {
  return p.trust === "unsigned";
}

export function isolationLine(isolation: string): string {
  return isolation === "container"
    ? "Runs in its own container, apart from Loomux."
    : "Runs as Loomux's own user, with access to what Loomux can reach.";
}

const CAPABILITY_WORDS: Record<string, string> = {
  "targets.create": "creates machines",
  "targets.stop_start": "can stop and start them",
  "targets.recreate": "can make them again",
  "targets.persistent": "can keep their data",
  "targets.ephemeral": "can make throwaway ones",
  "targets.egress_policy": "can cut their network",
  "targets.attach_commands": "shows how to attach to them",
};

export function capabilityWords(capabilities: string[]): string {
  const words = capabilities.map((c) => CAPABILITY_WORDS[c]).filter(Boolean);
  if (words.length === 0) return "";
  const text = words.length === 1 ? words[0] : `${words.slice(0, -1).join(", ")} and ${words[words.length - 1]}`;
  return text.charAt(0).toUpperCase() + text.slice(1) + ".";
}

// An installed instance's state, worst first.
export function pluginState(p: Plugin): { label: string; tone: Tone } {
  if (p.status === "error") return { label: p.status_reason ? `Error: ${p.status_reason}` : "Error", tone: "bad" };
  if (p.secrets_unreadable) return { label: "Its secrets can't be read with this server's master key", tone: "bad" };
  if (!p.enabled || p.status === "disabled") return { label: "Disabled", tone: "muted" };
  if (p.status === "installing") return { label: "Installing…", tone: "mari" };
  if (p.instance && p.instance !== "running") {
    return { label: `${p.instance === "restarting" ? "Restarting" : "Not running"}${p.instance_reason ? `: ${p.instance_reason}` : ""}`, tone: "bad" };
  }
  if (p.check && !p.check.ok) return { label: "Its check found problems", tone: "bad" };
  if (p.check?.problems.some((x) => x.severity === "warning")) return { label: "Running, with warnings", tone: "mari" };
  return { label: "Running", tone: "good" };
}

export function canCreateMachines(p: Plugin): boolean {
  return p.enabled && p.status === "installed" && p.instance === "running" && p.capabilities.includes("targets.create") && p.check?.ok !== false;
}

export function upgradeAvailable(p: Plugin): boolean {
  return !!p.available_version && p.available_version !== p.version;
}

// A created machine's phase while it comes up, and after.
export interface MachinePhase {
  label: string;
  tone: Tone;
  // In flight: the page keeps polling and shows the strip.
  busy: boolean;
  // 0 creating, 1 starting, 2 ready; -1 off the happy path.
  step: number;
  pulling: boolean;
}

export function machinePhase(m: TargetPlugin): MachinePhase {
  // The plugin says it in status_reason today ("pulling the image on node
  // …"); progress is the structured form, when the server sends it.
  const pulling = m.progress === "image_pull" || /pulling the image/i.test(m.status_reason);
  switch (m.status) {
    case "creating":
      return { label: pulling ? "Pulling the image" : "Creating", tone: "mari", busy: true, step: 0, pulling };
    case "starting":
      return { label: pulling ? "Pulling the image" : "Starting", tone: "mari", busy: true, step: 1, pulling };
    case "recreating":
      return { label: pulling ? "Pulling the image" : "Making it again", tone: "mari", busy: true, step: 0, pulling };
    case "running":
      return { label: "Running", tone: "good", busy: false, step: 2, pulling: false };
    case "stopped":
      return { label: "Stopped", tone: "muted", busy: false, step: -1, pulling: false };
    case "destroying":
      return { label: "Being destroyed", tone: "mari", busy: true, step: -1, pulling: false };
    case "detached":
      return { label: "Its plugin was removed: remove the machine by hand", tone: "mari", busy: false, step: -1, pulling: false };
    case "lost":
      return { label: "Lost: the plugin no longer has it", tone: "bad", busy: false, step: -1, pulling: false };
    default:
      return { label: "Error", tone: "bad", busy: false, step: -1, pulling: false };
  }
}

export function machineShape(m: Pick<TargetPlugin, "size" | "persistent" | "egress">): string {
  const parts = [m.size, m.persistent ? "keeps its data" : "throwaway"];
  if (m.egress) parts.push(EGRESS[m.egress]?.short ?? m.egress);
  return parts.filter(Boolean).join(" · ");
}

// What each egress class lets a machine reach (server plugins/kubernetes,
// LOOM-201 none, LOOM-226 trusted).
export const EGRESS: Record<string, { label: string; short: string; description: string }> = {
  internet: {
    label: "Internet",
    short: "internet",
    description: "The internet and DNS; not your LAN, the tailnet or the cluster, where the cluster's NetworkPolicies hold.",
  },
  none: { label: "None", short: "no network", description: "DNS only. Loomux checks the cluster really enforces it before the machine starts." },
  trusted: {
    label: "Trusted",
    short: "trusted network",
    description: "The internet, your LAN and the tailnet.",
  },
};

// The trusted class opens more than its name suggests (LOOM-226): said
// before anyone picks it.
export const TRUSTED_WARNING =
  "Trusted opens your LAN and the tailnet to this machine, including the cluster's nodes (the Kubernetes API on 6443, the kubelets on 10250) and every other host on the LAN. Use it only for a machine you'd trust with those, like the command-center hub. The plugin offers it only for machines its trusted_machines setting names, and the cluster's own NetworkPolicy has to allow it.";

// The choices the create form offers. From the instance's targets.describe
// when the server has the route; otherwise from what its configuration
// and capabilities say, and the server's answer to the create corrects
// anything left (it names the valid sizes and egress classes).
export interface MachineChoices {
  sizes: { name: string; detail: string }[];
  // Sizes known: a picker; unknown: free text with the plugin's default.
  sizesKnown: boolean;
  persistentDefault: boolean;
  canChooseKeep: boolean;
  egress: string[];
  fromDescribe: boolean;
}

function sizeDetail(s: { cpu?: string; memory?: string; disk?: string }): string {
  return [s.cpu && `${s.cpu} CPU`, s.memory, s.disk && `${s.disk} disk`].filter(Boolean).join(" · ");
}

export function machineChoices(p: Plugin, info: TargetsInfo | null, name: string): MachineChoices {
  const caps = new Set(p.capabilities);
  const canChooseKeep = caps.has("targets.persistent") && caps.has("targets.ephemeral");
  if (info) {
    return {
      sizes: info.sizes.map((s) => ({ name: s.name, detail: sizeDetail(s) })),
      sizesKnown: info.sizes.length > 0,
      persistentDefault: canChooseKeep ? info.persistent_default : caps.has("targets.persistent"),
      canChooseKeep,
      egress: info.egress_options,
      fromDescribe: true,
    };
  }
  const configured = p.config.sizes;
  const sizes =
    configured && typeof configured === "object" && !Array.isArray(configured)
      ? Object.entries(configured as Record<string, { cpu?: string; memory?: string; disk?: string }>).map(([n, s]) => ({
          name: n,
          detail: sizeDetail(s ?? {}),
        }))
      : [];
  const egress: string[] = [];
  if (caps.has("targets.egress_policy")) {
    egress.push("internet", "none");
    const trusted = typeof p.config.trusted_machines === "string" ? p.config.trusted_machines : "";
    if (
      name.trim() !== "" &&
      trusted
        .split(",")
        .map((s) => s.trim())
        .includes(name.trim())
    ) {
      egress.push("trusted");
    }
  }
  return { sizes, sizesKnown: sizes.length > 0, persistentDefault: caps.has("targets.persistent"), canChooseKeep, egress, fromDescribe: false };
}

// POST /targets for a created machine: the name and the policy part of the
// form, and the plugin object; never the connection fields, which the
// plugin sets (the server refuses them, 400).
export function machineRequest(values: TargetFormValues, plugin: MachineRequest["plugin"]): MachineRequest {
  const t = toTargetRequest(values, { isNew: true });
  return {
    name: t.name,
    permission_mode: t.permission_mode,
    purpose: t.purpose,
    allowed_agent_types: t.allowed_agent_types,
    allow_provision: t.allow_provision,
    allow_shell: t.allow_shell,
    require_confirmation: t.require_confirmation,
    relay: t.relay,
    plugin,
  };
}

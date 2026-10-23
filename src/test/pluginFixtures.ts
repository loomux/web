// Plugin and created-machine fixtures for the tests (server api/plugins.go
// pluginResponse, api/machines.go targetPluginResponse shapes).
import type { AvailablePlugin, Plugin, TargetPlugin } from "../lib/api";

export function aPlugin(over: Partial<Plugin> = {}): Plugin {
  return {
    id: "p-1",
    name: "kubernetes",
    label: "wysekube",
    version: "0.4.0",
    available_version: "0.4.0",
    protocol: "loomux-plugin/1",
    source: "socket",
    path: "/run/loomux/plugins/kubernetes.sock",
    trust: "bundled",
    status: "installed",
    status_reason: "",
    enabled: true,
    capabilities: ["targets.create", "targets.stop_start", "targets.recreate", "targets.persistent", "targets.ephemeral", "targets.egress_policy"],
    config: { namespace: "loomux-agents", kubeconfig: { set: false } },
    secrets_unreadable: false,
    check: { ok: true, problems: [] },
    instance: "running",
    instance_reason: "",
    machines: 0,
    installed_at: "2026-10-20T00:00:00Z",
    updated_at: "2026-10-20T00:00:00Z",
    ...over,
  };
}

export function aMachine(over: Partial<TargetPlugin> = {}): TargetPlugin {
  return {
    id: "p-1",
    name: "kubernetes",
    label: "wysekube",
    version: "0.4.0",
    environment_id: "k7f3q2",
    status: "running",
    status_reason: "",
    size: "medium",
    persistent: true,
    egress: "internet",
    image: "ghcr.io/loomux/agent:main",
    image_digest: "sha256:abc",
    update_available: false,
    warnings: [],
    created_at: "2026-10-20T00:00:00Z",
    ...over,
  };
}

export function aCatalogEntry(over: Partial<AvailablePlugin> = {}): AvailablePlugin {
  return {
    name: "kubernetes",
    title: "Kubernetes",
    version: "0.4.0",
    protocol: "loomux-plugin/1",
    vendor: "Loomux",
    homepage: "",
    description: "Machines as pods in a namespace of your cluster.",
    min_host_version: "0.4.0",
    source: "socket",
    path: "/run/loomux/plugins/kubernetes.sock",
    trust: "bundled",
    isolation: "container",
    capabilities: ["targets.create", "targets.persistent"],
    permissions: [{ scope: "kubernetes", detail: "create pods, secrets and PVCs in its namespace" }],
    config_schema: {
      type: "object",
      required: ["namespace"],
      properties: {
        namespace: { type: "string", default: "loomux-agents" },
        kubeconfig: { type: "string", "x-secret": true, "x-format": "kubeconfig" },
        max_environments: { type: "integer", minimum: 1, default: 5 },
      },
    },
    installed: [],
    ...over,
  };
}

import { describe, expect, it } from "vitest";
import { buildConfig, fieldLabel, initialValues, schemaFields, secretSet } from "./pluginSchema";

// The Kubernetes plugin's schema, trimmed (server plugins/kubernetes/plugin.json).
const k8s = {
  type: "object",
  required: ["namespace", "storage_class", "agent_image"],
  properties: {
    namespace: { type: "string", default: "loomux-agents", description: "where machines are made" },
    storage_class: { type: "string", default: "ceph-rbd-sc-delete" },
    agent_image: { type: "string", "x-format": "image-reference", default: "ghcr.io/loomux/agent:main" },
    kubeconfig: { type: "string", "x-secret": true, "x-format": "kubeconfig" },
    sizes: { type: "object", additionalProperties: { type: "object", properties: { cpu: { type: "string" } } } },
    max_environments: { type: "integer", minimum: 1, default: 5 },
    require_network_policy: { type: "boolean", default: false },
  },
};

const docker = {
  type: "object",
  required: ["engine"],
  properties: {
    engine: { type: "string" },
    ssh_private_key: { type: "string", "x-secret": true, "x-format": "ssh-private-key" },
    token: { type: "string", "x-secret": true },
    ssh_proxy: { type: "string", enum: ["default", "none"], default: "default" },
    limits: { type: "object", properties: { cpu: { type: "number" }, pids: { type: "integer", minimum: 10 } } },
  },
};

describe("schemaFields", () => {
  it("maps each property to a widget, required first", () => {
    const fields = schemaFields(k8s);
    expect(fields.slice(0, 3).map((f) => f.key)).toEqual(["namespace", "storage_class", "agent_image"]);
    const by = Object.fromEntries(fields.map((f) => [f.key, f]));
    expect(by.kubeconfig.kind).toBe("secret-multiline");
    expect(by.kubeconfig.secret).toBe(true);
    expect(by.sizes.kind).toBe("json");
    expect(by.max_environments).toMatchObject({ kind: "integer", minimum: 1 });
    expect(by.require_network_policy.kind).toBe("boolean");
    expect(by.storage_class.label).toBe("Storage class");
  });

  it("flattens one level of nested objects and keeps enums", () => {
    const by = Object.fromEntries(schemaFields(docker).map((f) => [f.key, f]));
    expect(by["limits.cpu"]).toMatchObject({ kind: "number", group: "Limits" });
    expect(by["limits.pids"]).toMatchObject({ kind: "integer", minimum: 10 });
    expect(by.ssh_proxy).toMatchObject({ kind: "select", options: ["default", "none"] });
    expect(by.ssh_private_key.kind).toBe("secret-multiline");
    expect(by.token.kind).toBe("secret");
  });

  it("is empty for no or a bad schema", () => {
    expect(schemaFields(undefined)).toEqual([]);
    expect(schemaFields({ type: "object" })).toEqual([]);
    expect(schemaFields("nope")).toEqual([]);
  });

  it("labels names in plain words", () => {
    expect(fieldLabel("trusted_machines")).toBe("Trusted machines");
  });
});

describe("initialValues", () => {
  it("starts an install from the defaults and a configure from the stored config, secrets empty", () => {
    const fields = schemaFields(k8s);
    expect(initialValues(fields)).toMatchObject({ namespace: "loomux-agents", max_environments: "5", require_network_policy: false, kubeconfig: "", sizes: "" });
    const stored = initialValues(fields, {
      namespace: "agents",
      kubeconfig: { set: true },
      sizes: { large: { cpu: "4" } },
      require_network_policy: true,
    });
    expect(stored.namespace).toBe("agents");
    expect(stored.kubeconfig).toBe("");
    expect(stored.require_network_policy).toBe(true);
    expect(JSON.parse(String(stored.sizes))).toEqual({ large: { cpu: "4" } });
  });

  it("reads whether a secret is set without ever seeing it", () => {
    expect(secretSet({ kubeconfig: { set: true } }, "kubeconfig")).toBe(true);
    expect(secretSet({ kubeconfig: { set: false } }, "kubeconfig")).toBe(false);
    expect(secretSet({}, "kubeconfig")).toBe(false);
  });
});

describe("buildConfig", () => {
  it("builds typed values and nested objects, leaving empty optional fields out", () => {
    const fields = schemaFields(docker);
    const values = { ...initialValues(fields), engine: "  ssh://docker@host ", "limits.cpu": "1.5", "limits.pids": "64", token: "" };
    const { config, errors } = buildConfig(fields, values, { mode: "install" });
    expect(errors).toEqual({});
    expect(config).toEqual({ engine: "ssh://docker@host", ssh_proxy: "default", limits: { cpu: 1.5, pids: 64 } });
  });

  it("checks what the server checks: required, whole numbers, minimum, JSON objects", () => {
    const fields = schemaFields({ ...docker, properties: { ...docker.properties, sizes: { type: "object" } } });
    const { errors } = buildConfig(fields, { ...initialValues(fields), "limits.pids": "3", "limits.cpu": "x", sizes: "[1]" }, { mode: "install" });
    expect(errors).toEqual({ engine: "is required", "limits.pids": "must be at least 10", "limits.cpu": "must be a number", sizes: "must be an object" });
    expect(buildConfig(fields, { ...initialValues(fields), engine: "e", "limits.pids": "10.5" }, { mode: "install" }).errors).toEqual({
      "limits.pids": "must be a whole number",
    });
    expect(buildConfig(fields, { ...initialValues(fields), engine: "e", sizes: "{oops" }, { mode: "install" }).errors).toEqual({ sizes: "must be valid JSON" });
  });

  it("sends a secret only when typed, keeps a stored one, and clears it with an explicit empty string", () => {
    const fields = schemaFields(docker);
    const stored = { engine: "e", token: { set: true }, ssh_private_key: { set: true } };
    const keep = buildConfig(fields, initialValues(fields, stored), { mode: "configure", config: stored });
    expect(keep.config).not.toHaveProperty("token");
    expect(keep.config).not.toHaveProperty("ssh_private_key");

    const typed = buildConfig(fields, { ...initialValues(fields, stored), token: "new-token", ssh_private_key: "-----BEGIN KEY-----\nabc\n\n" }, { mode: "configure", config: stored });
    expect(typed.config.token).toBe("new-token");
    // A key keeps its inner lines, without the trailing newline.
    expect(typed.config.ssh_private_key).toBe("-----BEGIN KEY-----\nabc");

    const cleared = buildConfig(fields, initialValues(fields, stored), { mode: "configure", config: stored, clear: new Set(["token"]) });
    expect(cleared.config.token).toBe("");
  });

  it("refuses clearing or omitting a required secret that has nothing else", () => {
    const schema = { type: "object", required: ["key"], properties: { key: { type: "string", "x-secret": true } } };
    const fields = schemaFields(schema);
    expect(buildConfig(fields, { key: "" }, { mode: "install" }).errors).toEqual({ key: "is required" });
    expect(buildConfig(fields, { key: "" }, { mode: "configure", config: { key: { set: true } } }).errors).toEqual({});
    expect(buildConfig(fields, { key: "" }, { mode: "configure", config: { key: { set: true } }, clear: new Set(["key"]) }).errors).toEqual({ key: "is required" });
  });

  it("refuses a value outside an enum", () => {
    const fields = schemaFields(docker);
    expect(buildConfig(fields, { ...initialValues(fields), engine: "e", ssh_proxy: "socks" }, { mode: "install" }).errors).toEqual({
      ssh_proxy: "must be one of default, none",
    });
  });
});

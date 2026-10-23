// A plugin's configuration form, generated from its manifest's
// config_schema (server plugins/manifest.go Schema/Property): an object of
// string, integer, number, boolean and object properties, with required,
// enum, default, minimum, x-secret and x-format, and objects nested at
// most one level deep. An object without properties (or with
// additionalProperties, like a map of sizes) is edited as JSON.
//
// Secrets are write-only: the server shows them as {set: true|false} and
// never sends a value, so their field always starts empty. On install a
// secret goes only when typed; on configure one left empty keeps the
// stored value, and clearing it sends "" (PUT /plugins/{id}/config).

export type FieldKind = "text" | "multiline" | "secret" | "secret-multiline" | "select" | "integer" | "number" | "boolean" | "json";

export interface SchemaField {
  // The config key; a nested one is "parent.child".
  key: string;
  label: string;
  kind: FieldKind;
  description: string;
  required: boolean;
  default: unknown;
  options: string[];
  minimum?: number;
  format: string;
  secret: boolean;
  // The parent object's label, for a nested field.
  group?: string;
}

interface Property {
  type?: string;
  description?: string;
  default?: unknown;
  enum?: unknown[];
  minimum?: number;
  "x-secret"?: boolean;
  "x-format"?: string;
  properties?: Record<string, Property>;
  required?: string[];
  additionalProperties?: unknown;
}

// Multi-line values: keys and kubeconfigs.
const MULTILINE_FORMATS = new Set(["ssh-private-key", "kubeconfig"]);

export function fieldLabel(name: string): string {
  const words = name.replaceAll("_", " ").replaceAll("-", " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function asSchema(schema: unknown): Property | null {
  return schema && typeof schema === "object" ? (schema as Property) : null;
}

function kindOf(p: Property): FieldKind {
  const multiline = MULTILINE_FORMATS.has(p["x-format"] ?? "");
  if (p["x-secret"]) return multiline ? "secret-multiline" : "secret";
  switch (p.type) {
    case "boolean":
      return "boolean";
    case "integer":
      return "integer";
    case "number":
      return "number";
    case "object":
      return "json";
    default:
      if (p.enum && p.enum.length > 0) return "select";
      return multiline ? "multiline" : "text";
  }
}

function toField(key: string, p: Property, required: boolean, group?: string): SchemaField {
  return {
    key,
    label: fieldLabel(key.split(".").pop() ?? key),
    kind: kindOf(p),
    description: p.description ?? "",
    required,
    default: p.default,
    options: (p.enum ?? []).map(String),
    minimum: typeof p.minimum === "number" ? p.minimum : undefined,
    format: p["x-format"] ?? "",
    secret: p["x-secret"] === true,
    group,
  };
}

// The form's fields, in the schema's order: required ones first, as the
// install form needs them most.
export function schemaFields(schema: unknown): SchemaField[] {
  const root = asSchema(schema);
  if (!root || !root.properties) return [];
  const required = new Set(root.required ?? []);
  const out: SchemaField[] = [];
  for (const [name, p] of Object.entries(root.properties)) {
    if (p.type === "object" && p.properties && Object.keys(p.properties).length > 0 && !p.additionalProperties) {
      const inner = new Set(p.required ?? []);
      for (const [child, cp] of Object.entries(p.properties)) {
        out.push(toField(`${name}.${child}`, cp, required.has(name) && inner.has(child), fieldLabel(name)));
      }
      continue;
    }
    out.push(toField(name, p, required.has(name)));
  }
  return out.sort((a, b) => Number(b.required) - Number(a.required));
}

export type FormValues = Record<string, string | boolean>;

function lookup(config: Record<string, unknown> | null | undefined, key: string): unknown {
  let v: unknown = config ?? undefined;
  for (const part of key.split(".")) {
    if (!v || typeof v !== "object") return undefined;
    v = (v as Record<string, unknown>)[part];
  }
  return v;
}

function display(f: SchemaField, v: unknown): string | boolean {
  if (f.kind === "boolean") return v === true;
  if (v === undefined || v === null) return "";
  if (f.kind === "json") return JSON.stringify(v, null, 2);
  return String(v);
}

// The form's starting values: the defaults for an install, the stored
// configuration for a configure. Secrets always start empty.
export function initialValues(fields: SchemaField[], config?: Record<string, unknown> | null): FormValues {
  const out: FormValues = {};
  for (const f of fields) {
    if (f.secret) {
      out[f.key] = "";
      continue;
    }
    const stored = config ? lookup(config, f.key) : undefined;
    out[f.key] = display(f, stored !== undefined ? stored : f.default);
  }
  return out;
}

// Whether a stored secret has a value (the server's {set: true}).
export function secretSet(config: Record<string, unknown> | null | undefined, key: string): boolean {
  const v = lookup(config, key);
  return !!v && typeof v === "object" && (v as { set?: unknown }).set === true;
}

export interface BuildOptions {
  // "configure": an empty secret keeps the stored one; the keys in clear
  // are sent as "" to erase theirs.
  mode: "install" | "configure";
  clear?: Set<string>;
  config?: Record<string, unknown> | null;
}

export interface BuildResult {
  config: Record<string, unknown>;
  // field key → what's wrong, as the server would say it.
  errors: Record<string, string>;
}

function setPath(obj: Record<string, unknown>, key: string, v: unknown) {
  const parts = key.split(".");
  let cur = obj;
  for (const p of parts.slice(0, -1)) {
    if (!cur[p] || typeof cur[p] !== "object") cur[p] = {};
    cur = cur[p] as Record<string, unknown>;
  }
  cur[parts[parts.length - 1]] = v;
}

// The configuration to send, checked the way the server's Schema.Validate
// checks it (type, minimum, enum, required: a required field without a
// default must be given).
export function buildConfig(fields: SchemaField[], values: FormValues, opts: BuildOptions): BuildResult {
  const config: Record<string, unknown> = {};
  const errors: Record<string, string> = {};
  for (const f of fields) {
    const raw = values[f.key];
    if (f.kind === "boolean") {
      setPath(config, f.key, raw === true);
      continue;
    }
    const text = typeof raw === "string" ? raw : "";
    // Keys and kubeconfigs are kept as typed (minus a trailing newline);
    // one-line values are trimmed.
    const value = f.kind === "multiline" || f.kind === "secret-multiline" ? text.replace(/\n+$/, "") : text.trim();
    if (f.secret) {
      if (opts.mode === "configure" && opts.clear?.has(f.key)) {
        if (f.required) errors[f.key] = "is required";
        else setPath(config, f.key, "");
        continue;
      }
      if (value !== "") setPath(config, f.key, value);
      else if (f.required && f.default === undefined && !(opts.mode === "configure" && secretSet(opts.config, f.key))) {
        errors[f.key] = "is required";
      }
      continue;
    }
    if (value === "") {
      if (f.required && f.default === undefined) errors[f.key] = "is required";
      continue;
    }
    switch (f.kind) {
      case "integer":
      case "number": {
        const n = Number(value);
        if (!Number.isFinite(n)) errors[f.key] = "must be a number";
        else if (f.kind === "integer" && !Number.isInteger(n)) errors[f.key] = "must be a whole number";
        else if (f.minimum !== undefined && n < f.minimum) errors[f.key] = `must be at least ${f.minimum}`;
        else setPath(config, f.key, n);
        break;
      }
      case "json": {
        try {
          const parsed: unknown = JSON.parse(value);
          if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) errors[f.key] = "must be an object";
          else setPath(config, f.key, parsed);
        } catch {
          errors[f.key] = "must be valid JSON";
        }
        break;
      }
      default:
        if (f.options.length > 0 && !f.options.includes(value)) errors[f.key] = `must be one of ${f.options.join(", ")}`;
        else setPath(config, f.key, value);
    }
  }
  return { config, errors };
}

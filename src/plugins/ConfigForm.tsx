import { useId } from "react";
import { secretSet, type FormValues, type SchemaField } from "../lib/pluginSchema";
import { Switch } from "../ui/Switch";

// The fields of a plugin's configuration, from its schema (lib/pluginSchema).
// Install and configure share it; secrets are write-only either way: their
// box starts empty, a stored one only says "set", and Clear erases it.

const INPUT = "min-h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface-2 px-3 text-ink placeholder:text-ink-3";
const AREA = "min-h-28 w-full min-w-0 rounded-control border border-line-strong bg-surface-2 px-3 py-2 font-mono text-sm text-ink";

export function ConfigForm({
  fields,
  values,
  onChange,
  errors,
  mode,
  config,
  clear,
  onToggleClear,
}: {
  fields: SchemaField[];
  values: FormValues;
  onChange: (key: string, value: string | boolean) => void;
  errors: Record<string, string>;
  mode: "install" | "configure";
  // The stored configuration (configure): which secrets are set.
  config?: Record<string, unknown> | null;
  clear?: Set<string>;
  onToggleClear?: (key: string) => void;
}) {
  const id = useId();
  if (fields.length === 0) return <p className="text-sm text-ink-2">This plugin has no settings.</p>;
  return (
    <div className="flex flex-col gap-4">
      {fields.map((f, i) => {
        const heading = f.group && f.group !== fields[i - 1]?.group ? f.group : null;
        const fieldId = `${id}-${f.key}`;
        const error = errors[f.key];
        const help = f.description || (f.default !== undefined && f.kind !== "boolean" ? `Default: ${JSON.stringify(f.default)}` : "");
        const isSet = f.secret && mode === "configure" && secretSet(config, f.key);
        const clearing = clear?.has(f.key) ?? false;
        return (
          <div key={f.key} className="flex flex-col gap-1">
            {heading && <h4 className="mt-2 font-bold text-ink-2">{heading}</h4>}
            {f.kind === "boolean" ? (
              <Switch label={f.label} description={f.description} isSelected={values[f.key] === true} onChange={(on) => onChange(f.key, on)} />
            ) : (
              <>
                <label htmlFor={fieldId} className="font-bold text-ink">
                  {f.label}
                  {f.required && f.default === undefined && !isSet && <span className="text-ink-3"> (required)</span>}
                </label>
                <FieldInput f={f} id={fieldId} value={String(values[f.key] ?? "")} onChange={(v) => onChange(f.key, v)} disabled={clearing} isSet={isSet} />
                {f.secret && (
                  <p className="text-sm text-ink-3">
                    {isSet
                      ? clearing
                        ? "The saved value will be erased."
                        : "Set. Leave empty to keep it; it's never shown again."
                      : "Never shown again once saved."}
                    {isSet && onToggleClear && (
                      <button type="button" className="ml-2 min-h-9 font-bold text-accent" onClick={() => onToggleClear(f.key)}>
                        {clearing ? "Keep it" : "Clear"}
                      </button>
                    )}
                  </p>
                )}
                {help && !f.secret && <p className="text-sm text-ink-3">{help}</p>}
                {help && f.secret && f.description && <p className="text-sm text-ink-3">{f.description}</p>}
              </>
            )}
            {error && (
              <p role="alert" className="text-sm text-bad">
                {f.label} {error}.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

function FieldInput({
  f,
  id,
  value,
  onChange,
  disabled,
  isSet,
}: {
  f: SchemaField;
  id: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  isSet: boolean;
}) {
  switch (f.kind) {
    case "select":
      return (
        <select id={id} className={INPUT} value={value} onChange={(e) => onChange(e.target.value)}>
          {!f.required && <option value="">(default)</option>}
          {f.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      );
    case "integer":
    case "number":
      return (
        <input
          id={id}
          className={INPUT}
          inputMode={f.kind === "integer" ? "numeric" : "decimal"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={f.default !== undefined ? String(f.default) : ""}
        />
      );
    case "json":
      return (
        <textarea
          id={id}
          className={AREA}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder={f.default !== undefined ? JSON.stringify(f.default) : '{"small": {"cpu": "1", "memory": "2Gi", "disk": "10Gi"}}'}
        />
      );
    case "multiline":
      return <textarea id={id} className={AREA} value={value} onChange={(e) => onChange(e.target.value)} spellCheck={false} />;
    case "secret-multiline":
      // A key or kubeconfig: a textarea can't be type=password, so it's
      // never pre-filled and cleared after every save.
      return (
        <textarea
          id={id}
          className={AREA}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          autoComplete="off"
          disabled={disabled}
          placeholder={isSet ? "Set (hidden). Paste a new one to replace it." : ""}
        />
      );
    case "secret":
      return (
        <input
          id={id}
          type="password"
          autoComplete="off"
          className={INPUT}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          placeholder={isSet ? "Set (hidden)" : ""}
        />
      );
    default:
      return (
        <input
          id={id}
          className={`${INPUT} ${f.format ? "font-mono" : ""}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          placeholder={f.default !== undefined ? String(f.default) : ""}
        />
      );
  }
}

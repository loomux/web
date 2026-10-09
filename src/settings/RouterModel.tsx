import { useId, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, type RouterSettingsChange, type RouterTier, type RouterTierRequest, type RouterTierTest } from "../lib/api";
import { formatRelativeTime } from "../lib/time";
import { useApiClient } from "../lib/useApiClient";
import { Button } from "../ui/Button";
import { ModelField } from "./ModelField";
import { useModelList } from "./useModelList";

// The router model's provider, model and key per tier (server LOOM-185,
// docs/design/router-settings.md): saved in Loomux over the server's
// environment, applied without a restart. Keys are write-only, like the
// vault's: typed into a password field, sent once, cleared from the page,
// never put in the query cache, a URL or storage. The server shows only a
// fingerprint and, for a long key, its last four characters.

const INPUT = "min-h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface-2 px-3 text-ink placeholder:text-ink-3";

const TIER_LABEL: Record<string, string> = { primary: "Primary", escalation: "Escalation" };

const SOURCE_LABEL: Record<RouterTier["source"], string> = {
  stored: "Saved in Loomux",
  env: "From the environment",
  none: "Off",
};

function message(err: unknown) {
  if (err instanceof ApiError && err.status === 503) return "This server has no LOOMUX_MASTER_KEY, so it can't store keys.";
  return err instanceof Error ? err.message : "Something went wrong.";
}

function keyText(t: RouterTier) {
  if (!t.key_fingerprint) return "";
  return t.key_last4 ? `•••• ${t.key_last4} · ${t.key_fingerprint}` : t.key_fingerprint;
}

function EditForm({ tier, providers, onDone }: { tier: RouterTier; providers: string[]; onDone: () => void }) {
  const id = useId();
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const stored = tier.source === "stored";
  const [provider, setProvider] = useState(tier.provider ?? providers[0] ?? "openai");
  const [baseURL, setBaseURL] = useState(tier.base_url ?? "");
  const [model, setModel] = useState(tier.model ?? "");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: (body: RouterTierRequest) => apiClient.setRouterTier(tier.tier, body),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["router-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["router-settings-audit"] });
      onDone();
    },
    onError: (err) => setError(message(err)),
    // Success or not, the key doesn't stay in the page.
    onSettled: () => setKey(""),
  });

  // The saved key is only kept for the endpoint it was entered for.
  const moved = stored && (provider !== tier.provider || baseURL.trim() !== (tier.base_url ?? ""));
  const keyNeeded = !stored || moved;
  const anthropic = provider === "anthropic";
  // The tier's own endpoint can be listed with its saved key; another
  // needs the key being typed (LOOM-191).
  const ownEndpoint = tier.source !== "none" && provider === tier.provider && baseURL.trim() === (tier.base_url ?? "");
  const models = useModelList(tier.tier, { provider, baseURL, key }, ownEndpoint);


  function submit(e: FormEvent) {
    e.preventDefault();
    const body: RouterTierRequest = { provider, base_url: baseURL.trim(), model: model.trim() };
    if (key) body.api_key = key;
    if ((!body.base_url && !anthropic) || !body.model) {
      setError(anthropic ? "Enter the model." : "Enter the base URL and the model.");
      return;
    }
    if (keyNeeded && !body.api_key) {
      setError(moved ? "Enter the API key again: the saved key isn't sent to a new provider or base URL." : "Enter the API key.");
      return;
    }
    setError(null);
    save.mutate(body);
  }

  return (
    <form onSubmit={submit} aria-label={`Edit ${TIER_LABEL[tier.tier]} tier`} className="mt-4 flex flex-col gap-4">
      {providers.length > 1 && (
        <div className="flex flex-col gap-1">
          <label htmlFor={`${id}-provider`} className="font-bold text-ink">
            Provider
          </label>
          <select id={`${id}-provider`} className={INPUT} value={provider} onChange={(e) => setProvider(e.target.value)}>
            {providers.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-url`} className="font-bold text-ink">
          Base URL
        </label>
        <input
          id={`${id}-url`}
          className={`${INPUT} font-mono`}
          value={baseURL}
          onChange={(e) => setBaseURL(e.target.value)}
          placeholder={anthropic ? "Leave empty for Anthropic's API" : "https://api.groq.com/openai/v1"}
          spellCheck={false}
          inputMode="url"
        />
        <p className="text-sm text-ink-3">https, or http to localhost.</p>
      </div>
      <ModelField value={model} onChange={setModel} list={models.list} canList={models.canList} onList={models.listNow} inputClassName={INPUT} />
      <div className="flex flex-col gap-1">
        <label htmlFor={`${id}-key`} className="font-bold text-ink">
          API key
        </label>
        <input
          id={`${id}-key`}
          type="password"
          autoComplete="off"
          className={INPUT}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={keyNeeded ? "" : "Leave empty to keep the saved key"}
        />
        <p className="text-sm text-ink-3">
          {moved ? "Needed again for a new provider or base URL. " : ""}Never shown again once saved.
        </p>
      </div>
      {error && (
        <p role="alert" className="text-bad">
          {error}
        </p>
      )}
      <div className="flex gap-3">
        <Button type="submit" variant="primary" isPending={save.isPending} pendingLabel="Saving…">
          Save
        </Button>
        <Button variant="quiet" onPress={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function TierCard({ tier, providers }: { tier: RouterTier; providers: string[] }) {
  const apiClient = useApiClient();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [result, setResult] = useState<RouterTierTest | null>(null);
  const label = TIER_LABEL[tier.tier] ?? tier.tier;

  const test = useMutation({
    mutationFn: () => apiClient.testRouterTier(tier.tier),
    onSuccess: setResult,
  });
  const clear = useMutation({
    mutationFn: () => apiClient.clearRouterTier(tier.tier),
    onSuccess: () => {
      setConfirm(false);
      setResult(null);
      void queryClient.invalidateQueries({ queryKey: ["router-settings"] });
      void queryClient.invalidateQueries({ queryKey: ["router-settings-audit"] });
    },
  });

  return (
    <li className="py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-bold text-ink">{label}</h3>
        <span className="rounded-full border border-line px-2 py-0.5 text-sm text-ink-2">{SOURCE_LABEL[tier.source]}</span>
      </div>
      {tier.stored_unreadable && (
        <p role="alert" className="mt-2 text-sm text-bad">
          The saved settings for this tier can't be decrypted with this server's master key; the environment's are in use. Save them
          again or remove them.
        </p>
      )}
      {tier.source !== "none" ? (
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
          {providers.length > 1 && (
            <>
              <dt className="text-ink-3">Provider</dt>
              <dd className="text-ink">{tier.provider}</dd>
            </>
          )}
          <dt className="text-ink-3">Base URL</dt>
          <dd className="min-w-0 break-all font-mono text-ink">{tier.base_url}</dd>
          <dt className="text-ink-3">Model</dt>
          <dd className="min-w-0 break-all font-mono text-ink">{tier.model}</dd>
          <dt className="text-ink-3">Key</dt>
          <dd className="min-w-0 break-all font-mono text-ink">{keyText(tier)}</dd>
          {tier.set_at && (
            <>
              <dt className="text-ink-3">Set</dt>
              <dd className="text-ink">{formatRelativeTime(tier.set_at)}</dd>
            </>
          )}
        </dl>
      ) : (
        <p className="mt-2 text-sm text-ink-2">No escalation model: a failing primary's error is shown as it is.</p>
      )}
      {result && (
        <p role="status" className={`mt-2 text-sm ${result.ok ? "text-ink" : "text-bad"}`}>
          {result.ok ? `Works · ${result.duration_ms} ms` : `Failed: ${result.error ?? "no answer"}`}
        </p>
      )}
      {(test.isError || clear.isError) && (
        <p role="alert" className="mt-2 text-sm text-bad">
          {message(test.error ?? clear.error)}
        </p>
      )}
      {editing ? (
        <EditForm
          tier={tier}
          providers={providers}
          onDone={() => {
            setEditing(false);
            setResult(null);
          }}
        />
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" onPress={() => setEditing(true)}>
            {tier.source === "none" ? "Set up" : "Edit"}
          </Button>
          {tier.source !== "none" && (
            <Button size="sm" variant="quiet" isPending={test.isPending} pendingLabel="Testing…" onPress={() => test.mutate()}>
              Test
            </Button>
          )}
          {tier.source === "stored" && !confirm && (
            <Button size="sm" variant="danger" onPress={() => setConfirm(true)}>
              Use environment settings
            </Button>
          )}
          {confirm && (
            <>
              <span className="text-sm text-ink">
                {tier.env_configured ? `Go back to the environment's settings for the ${tier.tier} tier?` : "Turn escalation off?"}
              </span>
              <Button size="sm" variant="danger" isPending={clear.isPending} pendingLabel="Removing…" onPress={() => clear.mutate()}>
                Yes, remove them
              </Button>
              <Button size="sm" variant="quiet" onPress={() => setConfirm(false)}>
                Keep them
              </Button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

function changeText(c: RouterSettingsChange) {
  const tier = TIER_LABEL[c.tier] ?? c.tier;
  if (c.action === "clear") return `${tier}: removed`;
  return `${tier}: ${c.fields.join(", ")} changed`;
}

export function RouterModel() {
  const apiClient = useApiClient();
  const settings = useQuery({ queryKey: ["router-settings"], queryFn: apiClient.getRouterSettings, retry: false });
  const audit = useQuery({
    queryKey: ["router-settings-audit"],
    queryFn: apiClient.listRouterSettingsChanges,
    enabled: settings.isSuccess,
    retry: false,
  });
  // An older server without router settings: nothing to show.
  if (settings.error instanceof ApiError && settings.error.status === 404) return null;
  const entries = audit.data?.entries ?? [];
  return (
    <section aria-labelledby="router-model" className="rounded-card border border-line bg-surface p-5">
      <h2 id="router-model" className="text-lg font-bold text-ink">
        Router model
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        The model that routes each message and condenses agents' replies. Changes apply at once; keys are never shown again.
      </p>
      {settings.isLoading && <p className="mt-3 text-ink-3">Loading…</p>}
      {settings.isError && (
        <p role="alert" className="mt-3 text-bad">
          Couldn't load the router settings.
        </p>
      )}
      {settings.data && (
        <ul className="mt-2 divide-y divide-line">
          {settings.data.tiers.map((t) => (
            <TierCard key={t.tier} tier={t} providers={settings.data.providers} />
          ))}
        </ul>
      )}
      {entries.length > 0 && (
        <>
          <h3 className="mt-4 font-bold text-ink">Recent changes</h3>
          <ul aria-label="Recent router changes" className="mt-1 text-sm text-ink-2">
            {entries.map((c) => (
              <li key={c.id}>
                {changeText(c)} · {formatRelativeTime(c.created_at)}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

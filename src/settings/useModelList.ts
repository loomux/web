import { useEffect, useState } from "react";
import type { RouterModels, RouterModelsRequest } from "../lib/api";
import { useApiClient } from "../lib/useApiClient";

export type ModelList =
  | { state: "idle"; hint?: string }
  | { state: "loading" }
  | { state: "ready"; models: RouterModels["models"] }
  | { state: "failed"; error: string };

// useModelList reads tier's model list for the endpoint in the form
// (LOOM-191). The tier's own endpoint is listed by itself, with its saved
// key, which never leaves the server. A key being typed is only sent when
// the user asks (list), for the provider and base URL as they are then:
// never while typing, so it can't go to a half-typed address. Changing
// any of them afterwards makes the list stale until asked again. The key
// is only held by the form and this call, never in a cache.
export function useModelList(
  tier: string,
  endpoint: { provider: string; baseURL: string; key: string },
  own: boolean,
): { list: ModelList; canList: boolean; listNow: () => void } {
  const apiClient = useApiClient();
  const { provider, key } = endpoint;
  const baseURL = endpoint.baseURL.trim();
  const auto = own && !key;
  const request = `${tier}\n${provider}\n${baseURL}\n${key}`;
  // The request the user asked for with List models, if any.
  const [asked, setAsked] = useState<string | null>(null);
  const [result, setResult] = useState<{ request: string; list: ModelList } | null>(null);
  const wanted = auto || asked === request;

  useEffect(() => {
    if (!wanted) return;
    let live = true;
    const body: RouterModelsRequest = key ? { provider, base_url: baseURL, api_key: key } : {};
    apiClient.listRouterModels(tier, body).then(
      (res) => {
        if (live) setResult({ request, list: res.ok ? { state: "ready", models: res.models } : { state: "failed", error: res.error ?? "the provider didn't answer" } });
      },
      (err: unknown) => {
        if (live) setResult({ request, list: { state: "failed", error: err instanceof Error ? err.message : "something went wrong" } });
      },
    );
    return () => {
      live = false;
    };
  }, [apiClient, wanted, request, tier, provider, baseURL, key]);

  const canList = !auto && !!key && (!!baseURL || provider === "anthropic");
  let list: ModelList;
  if (wanted) list = result?.request === request ? result.list : { state: "loading" };
  else if (!key) list = { state: "idle", hint: "Enter the API key, then List models, to see this endpoint's models." };
  else if (asked !== null) list = { state: "idle", hint: "The endpoint or key changed: List models again to see its models." };
  else list = { state: "idle", hint: "List models to see this endpoint's models." };
  return { list, canList, listNow: () => setAsked(request) };
}

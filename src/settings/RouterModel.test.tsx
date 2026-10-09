import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import type { RouterSettings } from "../lib/api";
import { RouterModel } from "./RouterModel";

const KEY = "sk-typed-secret-0123456789";

function renderIt() {
  localStorage.setItem("loomux.token", "tok");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterModel />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

function settings(): RouterSettings {
  return {
    providers: ["openai", "anthropic"],
    tiers: [
      {
        tier: "primary",
        source: "stored",
        provider: "openai",
        base_url: "https://api.example/v1",
        model: "small-model",
        key_fingerprint: "sha256:3f9a0c1e22b4",
        key_last4: "x9Qa",
        set_at: new Date().toISOString(),
        env_configured: true,
        stored_unreadable: false,
      },
      { tier: "escalation", source: "none", env_configured: false, stored_unreadable: false },
    ],
  };
}

describe("RouterModel", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("shows each tier's source and key fingerprint, saves without echoing the key, and tests", async () => {
    let current = settings();
    const puts: { url: string; body: Record<string, unknown> }[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        puts.push({ url, body });
        current = { ...current, tiers: [{ ...current.tiers[0], model: String(body.model), key_last4: "6789" }, current.tiers[1]] };
        return new Response(JSON.stringify(current.tiers[0]), { status: 200 });
      }
      if (init?.method === "POST" && url.endsWith("/primary/test")) {
        return new Response(JSON.stringify({ ok: true, model: "m", source: "stored", duration_ms: 412 }), { status: 200 });
      }
      if (url.includes("/audit")) {
        return new Response(
          JSON.stringify({ entries: [{ id: "c1", tier: "primary", action: "set", fields: ["model", "api_key"], actor: "session:s", created_at: new Date().toISOString() }] }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(current), { status: 200 });
    }) as typeof fetch;
    const { container } = renderIt();

    const rows = await screen.findAllByRole("listitem");
    const primary = rows.find((r) => r.textContent?.includes("Primary"))!;
    expect(primary).toHaveTextContent("Saved in Loomux");
    expect(primary).toHaveTextContent("•••• x9Qa · sha256:3f9a0c1e22b4");
    expect(await screen.findByText(/Primary: model, api_key changed/)).toBeInTheDocument();
    const escalation = rows.find((r) => r.textContent?.includes("Escalation"))!;
    expect(escalation).toHaveTextContent("Off");
    expect(within(escalation).queryByRole("button", { name: "Test" })).not.toBeInTheDocument();

    // A keyless save keeps the stored key: no api_key is sent.
    await userEvent.click(within(primary).getByRole("button", { name: "Edit" }));
    const model = screen.getByRole("combobox", { name: "Model" });
    await userEvent.clear(model);
    await userEvent.type(model, "bigger-model");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].url).toMatch(/\/api\/v1\/settings\/router\/primary$/);
    expect(puts[0].body).toEqual({ provider: "openai", base_url: "https://api.example/v1", model: "bigger-model" });

    // With a key: sent once, then gone from the page.
    await userEvent.click(await within(primary).findByRole("button", { name: "Edit" }));
    await userEvent.type(screen.getByLabelText("API key"), KEY);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(2));
    expect(puts[1].body.api_key).toBe(KEY);
    await waitFor(() => expect(screen.queryByLabelText("API key")).not.toBeInTheDocument());
    expect(container.innerHTML).not.toContain(KEY);

    await userEvent.click(within(primary).getByRole("button", { name: "Test" }));
    expect(await within(primary).findByRole("status")).toHaveTextContent("Works · 412 ms");
  });

  it("asks before going back to the environment's settings", async () => {
    const deleted: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "DELETE") {
        deleted.push(url);
        return new Response(null, { status: 204 });
      }
      if (url.includes("/audit")) return new Response(JSON.stringify({ entries: [] }), { status: 200 });
      return new Response(JSON.stringify(settings()), { status: 200 });
    }) as typeof fetch;
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Use environment settings" }));
    expect(deleted).toEqual([]);
    expect(screen.getByText("Go back to the environment's settings for the primary tier?")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Yes, remove them" }));
    await waitFor(() => expect(deleted).toEqual([expect.stringMatching(/\/api\/v1\/settings\/router\/primary$/)]));
  });

  it("hides itself on a server without router settings", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ error: "not available" }), { status: 404 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const { container } = renderIt();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(container).toBeEmptyDOMElement());
  });

  it("says why a save failed without a master key", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") return new Response(JSON.stringify({ error: "needs LOOMUX_MASTER_KEY" }), { status: 503 });
      if (String(input).includes("/audit")) return new Response(JSON.stringify({ entries: [] }), { status: 200 });
      return new Response(JSON.stringify(settings()), { status: 200 });
    }) as typeof fetch;
    const { container } = renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    await userEvent.type(screen.getByLabelText("API key"), KEY);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("no LOOMUX_MASTER_KEY");
    expect((screen.getByLabelText("API key") as HTMLInputElement).value).toBe("");
    expect(container.innerHTML).not.toContain(KEY);
  });

  it("asks for the key again when the base URL or provider changes", async () => {
    const puts: Record<string, unknown>[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)) as Record<string, unknown>);
        return new Response(JSON.stringify(settings().tiers[0]), { status: 200 });
      }
      if (String(input).includes("/audit")) return new Response(JSON.stringify({ entries: [] }), { status: 200 });
      return new Response(JSON.stringify(settings()), { status: 200 });
    }) as typeof fetch;
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
    const url = screen.getByLabelText("Base URL");
    await userEvent.clear(url);
    await userEvent.type(url, "https://elsewhere.example/v1");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Enter the API key again");
    expect(puts).toEqual([]);

    await userEvent.clear(url);
    await userEvent.type(url, "https://api.example/v1");
    await userEvent.selectOptions(screen.getByLabelText("Provider"), "anthropic");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(puts).toEqual([]);

    // Anthropic with no base URL and a new key goes through.
    await userEvent.clear(url);
    await userEvent.type(screen.getByLabelText("API key"), KEY);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({ provider: "anthropic", base_url: "", model: "small-model", api_key: KEY });
  });

  it("shows a failed test by its status and class", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Response(
          JSON.stringify({ ok: false, status: 401, error_class: "auth_failed", error: "the provider refused the key (HTTP 401)", model: "m", source: "stored", duration_ms: 80 }),
          { status: 200 },
        );
      }
      if (String(input).includes("/audit")) return new Response(JSON.stringify({ entries: [] }), { status: 200 });
      return new Response(JSON.stringify(settings()), { status: 200 });
    }) as typeof fetch;
    renderIt();
    await userEvent.click(await screen.findByRole("button", { name: "Test" }));
    expect(await screen.findByRole("status")).toHaveTextContent("Failed: the provider refused the key (HTTP 401)");
  });

  // LOOM-191: the model field lists the provider's models, filters as you
  // type, and still takes any name.
  describe("model picker", () => {
    type Call = { url: string; body: Record<string, unknown> };
    function serveModels(answer: (body: Record<string, unknown>) => unknown) {
      const calls: Call[] = [];
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/models")) {
          const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
          calls.push({ url, body });
          return new Response(JSON.stringify(answer(body)), { status: 200 });
        }
        if (url.includes("/audit")) return new Response(JSON.stringify({ entries: [] }), { status: 200 });
        return new Response(JSON.stringify(settings()), { status: 200 });
      }) as typeof fetch;
      return calls;
    }
    const listed = { ok: true, cached: false, models: [{ id: "claude-haiku-x" }, { id: "llama-70b" }, { id: "small-model" }, { id: "small-model-2" }] };

    it("lists the saved endpoint's models with its saved key, and filters as you type", async () => {
      const calls = serveModels(() => listed);
      renderIt();
      await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
      expect(await screen.findByText("4 models listed. Type to filter, or enter any name.")).toBeInTheDocument();
      expect(calls).toEqual([{ url: "/api/v1/settings/router/primary/models", body: {} }]);

      const box = screen.getByRole("combobox", { name: "Model" });
      await userEvent.clear(box);
      await userEvent.type(box, "small");
      const options = await screen.findAllByRole("option");
      expect(options.map((o) => o.textContent)).toEqual(["small-model", "small-model-2"]);
      await userEvent.click(options[1]);
      expect(box).toHaveValue("small-model-2");
    });

    it("keeps any typed name, and says so when the list can't be read", async () => {
      serveModels(() => ({ ok: false, models: [], status: 404, error_class: "not_found", error: "not found: check the base URL and the model (HTTP 404)", cached: false }));
      renderIt();
      await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
      expect(await screen.findByText(/Couldn't list models: not found.*You can still type one\./)).toBeInTheDocument();
      const box = screen.getByRole("combobox", { name: "Model" });
      await userEvent.clear(box);
      await userEvent.type(box, "my-private-model");
      expect(box).toHaveValue("my-private-model");
    });

    // Review of #105: a key being typed is never sent while typing, so it
    // can't go to a half-typed address; only List models sends it.
    it("sends a typed key only on List models, for the endpoint as it is then", async () => {
      const calls = serveModels(() => listed);
      renderIt();
      await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
      await waitFor(() => expect(calls).toHaveLength(1));
      expect(calls[0].body).toEqual({});

      // Key first, then the URL one character at a time: nothing is sent.
      await userEvent.type(screen.getByLabelText("API key"), KEY);
      const url = screen.getByLabelText("Base URL");
      await userEvent.clear(url);
      await userEvent.type(url, "https://api.openai.com/v1");
      await new Promise((r) => setTimeout(r, 900));
      expect(calls).toHaveLength(1);
      expect(screen.getByText("List models to see this endpoint's models.")).toBeInTheDocument();

      await userEvent.click(screen.getByRole("button", { name: "List models" }));
      await waitFor(() => expect(calls).toHaveLength(2));
      expect(calls[1].body).toEqual({ provider: "openai", base_url: "https://api.openai.com/v1", api_key: KEY });
      expect(await screen.findByText(/4 models listed/)).toBeInTheDocument();
      expect(document.body.textContent).not.toContain(KEY);

      // Editing the endpoint again makes the list stale; still nothing sent.
      await userEvent.type(url, "/x");
      await userEvent.selectOptions(screen.getByLabelText("Provider"), "anthropic");
      await new Promise((r) => setTimeout(r, 900));
      expect(calls).toHaveLength(2);
      expect(screen.getByText("The endpoint or key changed: List models again to see its models.")).toBeInTheDocument();
      await userEvent.click(screen.getByRole("button", { name: "List models" }));
      await waitFor(() => expect(calls).toHaveLength(3));
      expect(calls[2].body).toEqual({ provider: "anthropic", base_url: "https://api.openai.com/v1/x", api_key: KEY });
    });

    it("asks for the key before listing a new endpoint", async () => {
      const calls = serveModels(() => listed);
      renderIt();
      await userEvent.click(await screen.findByRole("button", { name: "Edit" }));
      await waitFor(() => expect(calls).toHaveLength(1));
      const url = screen.getByLabelText("Base URL");
      await userEvent.clear(url);
      await userEvent.type(url, "https://elsewhere.example/v1");
      expect(screen.getByText("Enter the API key, then List models, to see this endpoint's models.")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "List models" })).not.toBeInTheDocument();
      expect(calls).toHaveLength(1);
    });
  });
});

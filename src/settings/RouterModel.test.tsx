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
    providers: ["openai"],
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
    const model = screen.getByLabelText("Model");
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
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import type { Target } from "../lib/api";
import { MachinePage } from "./MachinePage";
import { MachinesPage } from "./MachinesPage";
import { MachineNewPage } from "./MachineNewPage";

function jsonResponse(body: unknown, status = 200) {
  return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status });
}

function kestrel(over: Partial<Target> = {}): Target {
  return {
    id: "t-kestrel",
    name: "kestrel",
    kind: "remote",
    host: "kestrel.corp.example",
    user: "ci",
    ssh_port: 2222,
    purpose: "work",
    relay: "",
    relay_effective: "none",
    allow_provision: true,
    allow_shell: false,
    require_confirmation: true,
    allowed_agent_types: ["claude-code"],
    pinned_host_keys: [],
    health: { status: "ok", reachable: true, latency_ms: 41, tmux_version: "3.5a", disk_free_bytes: 212e9, last_probed_at: new Date().toISOString() },
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...over,
  };
}

interface Call {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

function serve(target: Target, handlers: Record<string, (body?: Record<string, unknown>) => Response> = {}) {
  const calls: Call[] = [];
  let current = target;
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace("/api/v1", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ method, url, body });
    const h = handlers[`${method} ${url}`];
    if (h) return h(body);
    if (method === "GET" && url === "/targets") return jsonResponse({ targets: [current] });
    if (method === "GET" && url === "/workspaces") {
      return jsonResponse({ workspaces: [{ id: "w1", name: "infra-terraform", target_id: current.id, status: "idle" }] });
    }
    if (method === "PUT" && url === `/targets/${current.id}`) {
      current = { ...current, ...(body as Partial<Target>), relay_effective: (body?.relay as string) || "none" };
      return jsonResponse(current);
    }
    return jsonResponse({ error: "not found" }, 404);
  }) as typeof fetch;
  return calls;
}

function renderAt(path: string) {
  localStorage.setItem("loomux.token", "tok");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/machines", element: <MachinesPage /> },
      { path: "/machines/new", element: <MachineNewPage /> },
      { path: "/machines/:id", element: <MachinePage /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return router;
}

const SCAN = {
  target_id: "t-kestrel",
  host_keys: [
    { type: "ssh-ed25519", fingerprint: "SHA256:Qk3vT9bXw1mR8zJcLpYf0aNe4sHdUo6gKiV2tEr7yBw" },
    { type: "ecdsa-sha2-nistp256", fingerprint: "SHA256:7hPq2LmXc9Vb4NzR1tYs6KdWe3FgJaUo8iEr5yTwQkA" },
  ],
  expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
  pinned_host_keys: [],
};

describe("Machines", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("lists each machine with its health, policy, relay, host key and workspaces", async () => {
    serve(kestrel());
    renderAt("/machines");
    const card = await screen.findByRole("region", { name: "kestrel" });
    expect(card).toHaveTextContent("ci@kestrel.corp.example:2222");
    expect(card).toHaveTextContent("Reachable");
    expect(card).toHaveTextContent("tmux 3.5a");
    expect(card).toHaveTextContent("Work machine, no shell commands, only claude-code, asks before new work.");
    expect(card).toHaveTextContent("The router models see: Nothing");
    expect(card).toHaveTextContent("Host key not pinned");
    expect(within(card).getAllByRole("listitem").some((li) => li.textContent?.includes("infra-terraform"))).toBe(true);
  });

  it("scans the host key, pins only what you choose, and shows it pinned", async () => {
    const calls = serve(kestrel(), {
      "POST /targets/t-kestrel/scan-host-key": () => jsonResponse(SCAN),
      "POST /targets/t-kestrel/pin": (body) => jsonResponse(kestrel({ pinned_host_keys: [{ type: "ssh-ed25519", fingerprint: String(body?.fingerprint) }] })),
    });
    renderAt("/machines/t-kestrel");
    await userEvent.click(await screen.findByRole("button", { name: "Scan host key" }));
    const scanned = await screen.findByRole("region", { name: "Scanned host keys" });
    expect(scanned).toHaveTextContent("SHA256:Qk3vT9bX");
    expect(scanned).toHaveTextContent(/Pin within 9:5\d/);
    // Nothing is trusted until a key is pinned.
    expect(calls.some((c) => c.url.endsWith("/pin"))).toBe(false);
    await userEvent.click(within(scanned).getByRole("button", { name: "Pin ED25519 key" }));
    await waitFor(() =>
      expect(calls).toContainEqual({ method: "POST", url: "/targets/t-kestrel/pin", body: { fingerprint: SCAN.host_keys[0].fingerprint } }),
    );
  });

  it("says when a scan is too old to pin from", async () => {
    serve(kestrel(), {
      "POST /targets/t-kestrel/scan-host-key": () => jsonResponse(SCAN),
      "POST /targets/t-kestrel/pin": () => jsonResponse({ error: "no recent scan offered that fingerprint" }, 409),
    });
    renderAt("/machines/t-kestrel");
    await userEvent.click(await screen.findByRole("button", { name: "Scan host key" }));
    await userEvent.click(await screen.findByRole("button", { name: "Pin ED25519 key" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That scan has expired. Scan again, then pin.");
  });

  it("tests the connection and says what it found", async () => {
    serve(kestrel(), {
      "POST /targets/t-kestrel/test": () =>
        jsonResponse({ target_id: "t-kestrel", reachable: false, latency_ms: 0, host_key_problem: true, error: "host key mismatch" }),
    });
    renderAt("/machines/t-kestrel");
    await userEvent.click(await screen.findByRole("button", { name: "Test connection" }));
    expect(await screen.findByText(/host key doesn't match/)).toBeInTheDocument();
  });

  it("changes what the router models see, and saves every field back", async () => {
    const calls = serve(kestrel());
    renderAt("/machines/t-kestrel");
    expect(await screen.findByRole("radio", { name: "Default (Nothing)" })).toBeChecked();
    expect(screen.getByText(/none of this machine's work/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("radio", { name: "Final answer only" }));
    expect(screen.getByText(/only the agent's final message/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeDefined());
    expect(calls.find((c) => c.method === "PUT")!.body).toMatchObject({
      name: "kestrel",
      host: "kestrel.corp.example",
      user: "ci",
      ssh_port: 2222,
      purpose: "work",
      relay: "last_message",
      allow_shell: false,
      require_confirmation: true,
      allowed_agent_types: ["claude-code"],
    });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save changes" })).not.toBeInTheDocument());
  });

  it("explains a refused removal while workspaces live there", async () => {
    serve(kestrel(), { "DELETE /targets/t-kestrel": () => jsonResponse({ error: "target is referenced by 1 workspace" }, 409) });
    renderAt("/machines/t-kestrel");
    await userEvent.click(await screen.findByRole("button", { name: "Remove kestrel" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, remove kestrel" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("kestrel still has workspaces. Delete them first, on Machines.");
  });

  it("registers a machine and opens it", async () => {
    const calls = serve(kestrel(), {
      "POST /targets": (body) => jsonResponse({ ...kestrel(), id: "t-new", name: String(body?.name) }, 201),
    });
    const router = renderAt("/machines/new");
    await userEvent.type(screen.getByLabelText("Name"), "atlas");
    await userEvent.type(screen.getByLabelText("Host"), "atlas.lab.example");
    await userEvent.type(screen.getByLabelText("User"), "dev");
    await userEvent.click(screen.getByRole("button", { name: "Register machine" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/machines/t-new"));
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ name: "atlas", kind: "remote", host: "atlas.lab.example", user: "dev", ssh_port: 0, relay: "" });
  });
});

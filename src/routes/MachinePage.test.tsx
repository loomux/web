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

  it("says the list failed instead of showing the empty state", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: "boom" }, 500)) as typeof fetch;
    renderAt("/machines");
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't load your machines");
    expect(screen.queryByText("No machines yet.")).not.toBeInTheDocument();
  });

  it("checks a remote machine has a host before sending anything", async () => {
    const calls = serve(kestrel());
    renderAt("/machines/new");
    await userEvent.type(screen.getByLabelText("Name"), "atlas");
    await userEvent.click(screen.getByRole("button", { name: "Register machine" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("host and user are required for a remote target");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("shows the server's refusal of a duplicate name", async () => {
    serve(kestrel(), { "POST /targets": () => jsonResponse({ error: "a target named atlas already exists" }, 409) });
    renderAt("/machines/new");
    await userEvent.type(screen.getByLabelText("Name"), "atlas");
    await userEvent.type(screen.getByLabelText("Host"), "atlas.lab.example");
    await userEvent.type(screen.getByLabelText("User"), "dev");
    await userEvent.click(screen.getByRole("button", { name: "Register machine" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("a target named atlas already exists");
  });
});

// LOOM-138: machines that sign in with a key of their own.
const KEY = {
  id: "k-wyzer",
  name: "wyzer",
  type: "ssh-ed25519",
  fingerprint: "SHA256:h0B6Z2+ALrf1Lw8zMJd3YcIfoWghKezavKnUwNyYk0w",
  public_key: "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKD6FO loomux-wyzer",
};

function wyzer(over: Partial<Target> = {}): Target {
  return kestrel({
    id: "t-kestrel",
    host: "wyzer.tail78a87c.ts.net",
    user: "orski",
    ssh_port: 0,
    ssh_mode: "managed",
    ssh_key: KEY,
    ssh_proxy: "default",
    pinned_host_keys: [{ type: "ssh-ed25519", fingerprint: "SHA256:UE8eCo7w" }],
    ready: false,
    next_step: "authorize_key",
    ...over,
  });
}

const PLAN = {
  target_id: "t-kestrel",
  dry_run: true,
  can_apply: true,
  problems: [],
  plan: {
    host: "100.80.216.64",
    ssh_port: 22,
    user: "ci",
    ssh_proxy: "default",
    key: { type: "ssh-ed25519", fingerprint: "SHA256:mKCgsi83", source_file: "/home/loomux/.ssh/id_ed25519", existing_key_id: "" },
    host_keys: [{ type: "ssh-ed25519", fingerprint: "SHA256:UE8eCo7w" }],
  },
  applied: false,
  rolled_back: false,
  test: null,
  target: null,
};

const AUTH_FAILED_STEPS = [
  { name: "connect", status: "ok" },
  { name: "host_key", status: "ok" },
  { name: "auth", status: "failed", error: "refused Loomux's SSH key (auth_failed)" },
  { name: "tmux", status: "skipped" },
];

describe("Signing in", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("shows a managed machine's next step and the line to add to authorized_keys", async () => {
    serve(wyzer());
    renderAt("/machines/t-kestrel");
    const section = await screen.findByRole("region", { name: "Signing in" });
    const steps = within(section).getByRole("list", { name: "Getting it ready" });
    expect(within(steps).getByText("Trust its host key")).toHaveTextContent("(done)");
    expect(within(steps).getByText("Let Loomux in").closest("li")).toHaveAttribute("aria-current", "step");
    expect(within(section).getByLabelText("Line for authorized_keys")).toHaveTextContent(
      "no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIKD6FO loomux-wyzer",
    );
    expect(section).toHaveTextContent("orski");
    expect(section).toHaveTextContent(KEY.fingerprint);
    expect(section).not.toHaveTextContent(/private/i);
  });

  it("says an unpinned managed machine won't be connected to", async () => {
    serve(wyzer({ pinned_host_keys: [], next_step: "pin_host_key" }));
    renderAt("/machines/t-kestrel");
    const hostKey = await screen.findByRole("region", { name: "Host key" });
    expect(hostKey).toHaveTextContent("Loomux won't connect until you pin");
    expect(hostKey).not.toHaveTextContent("known_hosts");
  });

  it("says a ready machine is ready", async () => {
    serve(wyzer({ ready: true, next_step: null }));
    renderAt("/machines/t-kestrel");
    const section = await screen.findByRole("region", { name: "Signing in" });
    expect(within(section).getByRole("status")).toHaveTextContent("Ready");
  });

  it("replaces the key only after a second yes, sending the whole record back", async () => {
    const calls = serve(wyzer());
    renderAt("/machines/t-kestrel");
    await userEvent.click(await screen.findByRole("button", { name: "Replace key" }));
    expect(calls.some((c) => c.method === "PUT")).toBe(false);
    await userEvent.click(screen.getByRole("button", { name: "Replace it" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeDefined());
    expect(calls.find((c) => c.method === "PUT")!.body).toMatchObject({
      generate_ssh_key: true,
      name: "kestrel",
      host: "wyzer.tail78a87c.ts.net",
      user: "orski",
      purpose: "work",
      ssh_proxy: "default",
    });
  });

  it("shows the connection test step by step", async () => {
    serve(wyzer(), {
      "POST /targets/t-kestrel/test": () =>
        jsonResponse({ target_id: "t-kestrel", reachable: false, latency_ms: 0, host_key_problem: false, error: "x", steps: AUTH_FAILED_STEPS }),
    });
    renderAt("/machines/t-kestrel");
    await userEvent.click(await screen.findByRole("button", { name: "Test connection" }));
    const steps = await screen.findByRole("list", { name: "Connection test steps" });
    expect(steps).toHaveTextContent("Reach the machineok");
    expect(steps).toHaveTextContent("Sign infailed");
    expect(steps).toHaveTextContent("refused Loomux's SSH key");
    expect(steps).toHaveTextContent("Run tmuxnot tried");
  });

  it("checks moving a config machine to a key of its own, then moves it after a second yes", async () => {
    const calls = serve(kestrel({ ssh_mode: "config" }), {
      "POST /targets/t-kestrel/migrate-ssh": (body) =>
        body?.dry_run
          ? jsonResponse(PLAN)
          : jsonResponse({ ...PLAN, dry_run: false, applied: true, target: wyzer({ ready: true, next_step: null }) }),
    });
    renderAt("/machines/t-kestrel");
    await userEvent.click(await screen.findByRole("button", { name: "Check moving it to a key of its own" }));
    const section = screen.getByRole("region", { name: "Signing in" });
    expect(await within(section).findByText("Ready to move.")).toBeInTheDocument();
    expect(section).toHaveTextContent("ci@100.80.216.64");
    expect(section).toHaveTextContent("/home/loomux/.ssh/id_ed25519");
    expect(section).toHaveTextContent("SHA256:UE8eCo7w");
    expect(calls.filter((c) => c.url.endsWith("/migrate-ssh")).map((c) => c.body)).toEqual([{ dry_run: true }]);
    await userEvent.click(within(section).getByRole("button", { name: "Move it" }));
    await userEvent.click(within(section).getByRole("button", { name: "Move and test it" }));
    expect(await within(section).findByRole("status")).toHaveTextContent("Moved");
    expect(calls.filter((c) => c.url.endsWith("/migrate-ssh")).map((c) => c.body)).toEqual([{ dry_run: true }, { dry_run: false }]);
  });

  it("says what stops a move, and offers none", async () => {
    serve(kestrel({ ssh_mode: "config" }), {
      "POST /targets/t-kestrel/migrate-ssh": () =>
        jsonResponse({ ...PLAN, can_apply: false, problems: ["the SSH config reaches it through ProxyJump bastion"] }),
    });
    renderAt("/machines/t-kestrel");
    await userEvent.click(await screen.findByRole("button", { name: "Check moving it to a key of its own" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("ProxyJump bastion");
    expect(screen.queryByRole("button", { name: "Move it" })).not.toBeInTheDocument();
  });

  it("says a failed move was put back, with the test's steps", async () => {
    serve(kestrel({ ssh_mode: "config" }), {
      "POST /targets/t-kestrel/migrate-ssh": (body) =>
        body?.dry_run
          ? jsonResponse(PLAN)
          : jsonResponse(
              { ...PLAN, dry_run: false, rolled_back: true, test: { target_id: "t-kestrel", reachable: false, latency_ms: 0, host_key_problem: false, steps: AUTH_FAILED_STEPS } },
              502,
            ),
    });
    renderAt("/machines/t-kestrel");
    await userEvent.click(await screen.findByRole("button", { name: "Check moving it to a key of its own" }));
    await userEvent.click(await screen.findByRole("button", { name: "Move it" }));
    await userEvent.click(screen.getByRole("button", { name: "Move and test it" }));
    expect(await screen.findByText(/back on the SSH config, as before/)).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "Connection test steps" })).toHaveTextContent("Sign infailed");
  });

  it("registers a machine with a key of its own by default", async () => {
    const calls = serve(kestrel(), {
      "GET /ssh-keys": () => jsonResponse({ ssh_keys: [] }),
      "POST /targets": (body) => jsonResponse({ ...wyzer(), id: "t-new", name: String(body?.name) }, 201),
    });
    const router = renderAt("/machines/new");
    await screen.findByRole("radio", { name: "A key of its own" });
    await userEvent.type(screen.getByLabelText("Name"), "wyzer");
    await userEvent.type(screen.getByLabelText("Host"), "wyzer.tail78a87c.ts.net");
    await userEvent.type(screen.getByLabelText("User"), "orski");
    await userEvent.click(screen.getByRole("switch", { name: /Through the server's proxy/ }));
    await userEvent.click(screen.getByRole("button", { name: "Register machine" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/machines/t-new"));
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ generate_ssh_key: true, ssh_proxy: "none", host: "wyzer.tail78a87c.ts.net" });
  });

  it("refuses an alias as a managed machine's host before sending anything, but not for the SSH config", async () => {
    const calls = serve(kestrel(), {
      "GET /ssh-keys": () => jsonResponse({ ssh_keys: [] }),
      "POST /targets": () => jsonResponse({ ...kestrel(), id: "t-new" }, 201),
    });
    renderAt("/machines/new");
    await screen.findByRole("radio", { name: "A key of its own" });
    await userEvent.type(screen.getByLabelText("Name"), "w");
    await userEvent.type(screen.getByLabelText("Host"), "my_alias");
    await userEvent.type(screen.getByLabelText("User"), "orski");
    await userEvent.click(screen.getByRole("button", { name: "Register machine" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("for a target with a Loomux SSH key");
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    await userEvent.click(screen.getByRole("radio", { name: "The server's SSH config" }));
    await userEvent.click(screen.getByRole("button", { name: "Register machine" }));
    await waitFor(() => expect(calls.find((c) => c.method === "POST")).toBeDefined());
    expect(calls.find((c) => c.method === "POST")!.body!.generate_ssh_key).toBeUndefined();
  });
});

describe("Machines list and signing in", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("says what a managed machine still needs, and which machines use the server's SSH config", async () => {
    serve(wyzer());
    renderAt("/machines");
    expect(await screen.findByRole("region", { name: "kestrel" })).toHaveTextContent("Setup: let Loomux in");
  });

  it("marks a machine on the server's SSH config", async () => {
    serve(kestrel({ ssh_mode: "config" }));
    renderAt("/machines");
    expect(await screen.findByRole("region", { name: "kestrel" })).toHaveTextContent("Signs in through the server's SSH config");
  });
});

describe("Signing in, edge cases (#89 review)", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("offers no key of its own on a server without SSH keys, and registers through the SSH config", async () => {
    const calls = serve(kestrel(), {
      "POST /targets": () => jsonResponse({ ...kestrel(), id: "t-new" }, 201),
    });
    const router = renderAt("/machines/new");
    await userEvent.type(screen.getByLabelText("Name"), "box");
    await userEvent.type(screen.getByLabelText("Host"), "my_alias");
    await userEvent.type(screen.getByLabelText("User"), "dev");
    await waitFor(() => expect(calls.some((c) => c.url === "/ssh-keys")).toBe(true));
    expect(screen.queryByRole("radio", { name: "A key of its own" })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Register machine" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/machines/t-new"));
    const body = calls.find((c) => c.method === "POST")!.body!;
    expect(body.generate_ssh_key).toBeUndefined();
    expect(body.ssh_proxy).toBeUndefined();
  });

  it("says to use the SSH config when the server can't store keys", async () => {
    serve(kestrel(), {
      "GET /ssh-keys": () => jsonResponse({ ssh_keys: [] }),
      "POST /targets": () => jsonResponse({ error: "storing SSH keys needs LOOMUX_MASTER_KEY, which this server doesn't have" }, 503),
    });
    renderAt("/machines/new");
    await screen.findByRole("radio", { name: "A key of its own" });
    await userEvent.type(screen.getByLabelText("Name"), "box");
    await userEvent.type(screen.getByLabelText("Host"), "box.example");
    await userEvent.type(screen.getByLabelText("User"), "dev");
    await userEvent.click(screen.getByRole("button", { name: "Register machine" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/server's SSH config/);
  });

  // LOOM-183: a server that refuses local targets says local_targets false.
  it.each([
    [false, false],
    [true, true],
    [undefined, true],
  ])("with local_targets %s, offers This host: %s", async (local_targets, offered) => {
    const calls = serve(kestrel(), {
      "GET /targets": () => jsonResponse({ targets: [kestrel()], ...(local_targets === undefined ? {} : { local_targets }) }),
    });
    renderAt("/machines/new");
    await waitFor(() => expect(calls.some((c) => c.url === "/targets")).toBe(true));
    if (offered) {
      expect(await screen.findByRole("radio", { name: "This host" })).toBeInTheDocument();
    } else {
      await waitFor(() => expect(screen.queryByRole("radio", { name: "This host" })).not.toBeInTheDocument());
      expect(screen.getByLabelText("Host")).toBeInTheDocument();
    }
  });

  it("says only SSH machines can be registered when the server refuses local ones", async () => {
    serve(kestrel(), { "GET /targets": () => jsonResponse({ targets: [], local_targets: false }) });
    renderAt("/machines");
    expect(await screen.findByText(/a machine over SSH\./)).toBeInTheDocument();
    expect(screen.queryByText(/this host/)).not.toBeInTheDocument();
  });

  it("highlights no step it doesn't know, and says to test", async () => {
    serve(wyzer({ next_step: "something_new" }));
    renderAt("/machines/t-kestrel");
    const steps = await screen.findByRole("list", { name: "Getting it ready" });
    expect(within(steps).queryAllByRole("listitem").some((li) => li.getAttribute("aria-current") === "step")).toBe(false);
    expect(screen.getByRole("region", { name: "Signing in" })).toHaveTextContent("Not ready yet");
  });

  it("keeps saying a machine moved after it turns managed", async () => {
    let migrated = false;
    serve(kestrel({ ssh_mode: "config" }), {
      "GET /targets": () => jsonResponse({ targets: [migrated ? wyzer({ ready: true, next_step: null }) : kestrel({ ssh_mode: "config" })] }),
      "POST /targets/t-kestrel/migrate-ssh": (body) => {
        if (body?.dry_run) return jsonResponse(PLAN);
        migrated = true;
        return jsonResponse({ ...PLAN, dry_run: false, applied: true });
      },
    });
    renderAt("/machines/t-kestrel");
    await userEvent.click(await screen.findByRole("button", { name: "Check moving it to a key of its own" }));
    await userEvent.click(await screen.findByRole("button", { name: "Move it" }));
    expect(screen.getByText(/trusts the host keys listed above/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Move and test it" }));
    await screen.findByRole("list", { name: "Getting it ready" }); // now managed
    expect(screen.getByText(/Moved: it now signs in with a key of its own/)).toBeInTheDocument();
  });

  it.each([
    [500, "the migrated target failed its test and could not be put back: check it", "Stopped part-way"],
    [409, "the migrated target failed its test, but was changed while it ran, so it was left as it is now", "changed while the move was being tested"],
  ] as const)("says what happened when a move ends %i", async (status, problem, want) => {
    serve(kestrel({ ssh_mode: "config" }), {
      "POST /targets/t-kestrel/migrate-ssh": (body) =>
        body?.dry_run
          ? jsonResponse(PLAN)
          : jsonResponse(
              { ...PLAN, dry_run: false, problems: [problem], test: { target_id: "t-kestrel", reachable: false, latency_ms: 0, host_key_problem: false, steps: AUTH_FAILED_STEPS } },
              status,
            ),
    });
    renderAt("/machines/t-kestrel");
    await userEvent.click(await screen.findByRole("button", { name: "Check moving it to a key of its own" }));
    await userEvent.click(await screen.findByRole("button", { name: "Move it" }));
    await userEvent.click(screen.getByRole("button", { name: "Move and test it" }));
    expect(await screen.findByText(new RegExp(want))).toBeInTheDocument();
    expect(screen.queryByText("It wasn't moved.")).not.toBeInTheDocument();
  });

  it("warns that changing a managed machine's address means pinning again, and saves without touching its key", async () => {
    const calls = serve(wyzer());
    renderAt("/machines/t-kestrel");
    expect(await screen.findByText(/pin its host key again/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText("User"));
    await userEvent.type(screen.getByLabelText("User"), "dev");
    await userEvent.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(calls.find((c) => c.method === "PUT")).toBeDefined());
    const body = calls.find((c) => c.method === "PUT")!.body!;
    expect(body.ssh_proxy).toBe("default");
    expect(body.ssh_key_id).toBeUndefined();
    expect(body.generate_ssh_key).toBeUndefined();
  });

  it("shows the steps when tmux failed on a reachable machine", async () => {
    serve(wyzer(), {
      "POST /targets/t-kestrel/test": () =>
        jsonResponse({
          target_id: "t-kestrel", reachable: true, latency_ms: 12, host_key_problem: false,
          steps: [{ name: "connect", status: "ok" }, { name: "host_key", status: "ok" }, { name: "auth", status: "ok" }, { name: "tmux", status: "failed", error: "tmux not found" }],
        }),
    });
    renderAt("/machines/t-kestrel");
    await userEvent.click(await screen.findByRole("button", { name: "Test connection" }));
    expect(await screen.findByRole("list", { name: "Connection test steps" })).toHaveTextContent("tmux not found");
  });
});

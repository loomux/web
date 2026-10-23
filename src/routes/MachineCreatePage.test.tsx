import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import type { Plugin, Target, TargetsInfo } from "../lib/api";
import { aMachine, aPlugin } from "../test/pluginFixtures";
import { MachineCreatePage } from "./MachineCreatePage";
import { MachinePage } from "./MachinePage";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

const INFO: TargetsInfo = {
  sizes: [
    { name: "small", cpu: "1", memory: "2Gi", disk: "10Gi" },
    { name: "large", cpu: "4", memory: "8Gi", disk: "40Gi" },
  ],
  persistent_default: true,
  egress_options: ["internet", "none", "trusted"],
  image: "ghcr.io/loomux/agent:main",
  max_environments: 5,
  environments: 0,
};

function created(over: Partial<Target> = {}): Target {
  return {
    id: "t-cc",
    name: "cc",
    kind: "remote",
    host: "lx-k7f3q2.loomux-agents.loomux-agents.svc.cluster.local",
    user: "agent",
    ssh_port: 2222,
    ssh_mode: "managed",
    ssh_proxy: "none",
    plugin: aMachine({ status: "creating", status_reason: "pulling the image on node wyzerkube (for 1m20s)", egress: "trusted", size: "large" }),
    created_at: "2026-10-23T00:00:00Z",
    updated_at: "2026-10-23T00:00:00Z",
    ...over,
  };
}

function serve(opts: { plugins?: Plugin[]; info?: TargetsInfo | null; target?: Target }) {
  const calls: { method: string; url: string; body?: Record<string, unknown> }[] = [];
  let target = opts.target ?? created();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace("/api/v1", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ method, url, body });
    if (method === "GET" && url === "/plugins") return json({ plugins: opts.plugins ?? [aPlugin()] });
    if (method === "GET" && url.endsWith("/targets") && url.startsWith("/plugins/")) {
      return opts.info ? json(opts.info) : json({ error: "no route", code: "not_found" }, 404);
    }
    if (method === "POST" && url === "/targets") {
      target = created({ name: String(body?.name) });
      return json(target, 201);
    }
    if (method === "GET" && url === "/targets") return json({ targets: [target] });
    if (method === "GET" && url === "/workspaces") return json({ workspaces: [] });
    return json({ error: "not found", code: "not_found" }, 404);
  }) as typeof fetch;
  return calls;
}

function renderAt(path: string) {
  localStorage.setItem("loomux.token", "tok");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/machines/create", element: <MachineCreatePage /> },
      { path: "/machines/:id", element: <MachinePage /> },
      { path: "/machines", element: <p>Machines list</p> },
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

describe("MachineCreatePage", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("offers the instance's sizes and networks, warns about trusted, and posts no connection fields", async () => {
    const user = userEvent.setup();
    const calls = serve({ info: INFO });
    const router = renderAt("/machines/create?plugin=p-1");
    const form = await screen.findByRole("form", { name: "Create machine" });
    expect(await within(form).findByText("4 CPU · 8Gi · 40Gi disk")).toBeInTheDocument();
    await user.type(within(form).getByLabelText("Name"), "cc");
    await user.click(within(form).getByRole("radio", { name: /large/ }));
    await user.click(within(form).getByRole("radio", { name: /Trusted/ }));
    expect(within(form).getByRole("alert")).toHaveTextContent("the Kubernetes API on 6443");

    // Not until the trusted reach is confirmed.
    await user.click(within(form).getByRole("button", { name: "Create machine" }));
    expect(calls.some((c) => c.method === "POST")).toBe(false);
    expect(within(form).getAllByRole("alert").map((a) => a.textContent).join(" ")).toContain("Confirm that this machine may reach your LAN");

    await user.click(within(form).getByRole("checkbox", { name: /cc may reach my LAN and the tailnet/ }));
    await user.click(within(form).getByRole("switch", { name: /Ask me before starting new work here/ }));
    await user.click(within(form).getByRole("button", { name: "Create machine" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/machines/t-cc"));
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toMatchObject({ name: "cc", require_confirmation: true, plugin: { id: "p-1", size: "large", persistent: true, egress: "trusted" } });
    for (const k of ["host", "user", "kind", "ssh_port", "ssh_key_id", "generate_ssh_key", "ssh_proxy", "workspace_root"]) expect(post.body).not.toHaveProperty(k);

    // Then the machine's page follows it coming up, image pull included.
    const machine = await screen.findByRole("region", { name: "Machine" });
    expect(machine).toHaveTextContent("Created by kubernetes · wysekube");
    expect(machine).toHaveTextContent("large · keeps its data · trusted network");
    expect(within(machine).getByRole("list", { name: "Coming up" })).toHaveTextContent("Pulling the image");
    expect(machine).toHaveTextContent("pulling the image on node wyzerkube");
    expect(screen.queryByRole("region", { name: "Host key" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Signing in" })).toBeNull();
    expect(screen.getByRole("region", { name: "Delete this machine" })).toHaveTextContent("The machine is destroyed with its data");
  });

  it("falls back to the configuration on a server without the describe route", async () => {
    const user = userEvent.setup();
    const calls = serve({ info: null, plugins: [aPlugin({ config: { trusted_machines: "cc" } })] });
    renderAt("/machines/create?plugin=p-1");
    const form = await screen.findByRole("form", { name: "Create machine" });
    const size = await within(form).findByRole("textbox", { name: "Size" });
    expect(within(form).queryByRole("radio", { name: /Trusted/ })).toBeNull();
    await user.type(within(form).getByLabelText("Name"), "cc");
    expect(within(form).getByRole("radio", { name: /Trusted/ })).toBeInTheDocument();
    expect(form).toHaveTextContent("trusted_machines setting names this machine");
    await user.type(size, "medium");
    await user.click(within(form).getByRole("switch", { name: /Keep its data/ }));
    await user.click(within(form).getByRole("button", { name: "Create machine" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST")).toBe(true));
    expect(calls.find((c) => c.method === "POST")!.body).toMatchObject({ plugin: { id: "p-1", size: "medium", persistent: false, egress: "internet" } });
  });

  it("says when no plugin can make machines", async () => {
    serve({ plugins: [aPlugin({ instance: "failed" })] });
    renderAt("/machines/create");
    expect(await screen.findByText("No plugin can make machines yet.")).toBeInTheDocument();
  });
});

describe("MachinePage for a created machine", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("offers Retry on an error and edits only the name and policy", async () => {
    const user = userEvent.setup();
    const calls = serve({ target: created({ plugin: aMachine({ status: "error", status_reason: "create timed out after 10m" }) }) });
    renderAt("/machines/t-cc");
    const machine = await screen.findByRole("region", { name: "Machine" });
    expect(within(machine).getByRole("alert")).toHaveTextContent("create timed out after 10m");
    expect(screen.queryByLabelText("Host")).toBeNull();
    await user.click(within(machine).getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(calls.some((c) => c.method === "POST" && c.url === "/targets/t-cc/recreate")).toBe(true));
  });
});

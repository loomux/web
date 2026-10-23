import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import type { AvailablePlugin, Plugin } from "../lib/api";
import { aCatalogEntry, aPlugin } from "../test/pluginFixtures";
import { PluginsPage } from "./PluginsPage";

interface Call {
  method: string;
  url: string;
  body?: Record<string, unknown>;
}

function json(body: unknown, status = 200) {
  return status === 204 ? new Response(null, { status }) : new Response(JSON.stringify(body), { status });
}

function serve(opts: { installed?: Plugin[]; available?: AvailablePlugin[]; handlers?: Record<string, (body?: Record<string, unknown>) => Response> } = {}) {
  const calls: Call[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input).replace("/api/v1", "");
    const method = init?.method ?? "GET";
    const body = init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : undefined;
    calls.push({ method, url, body });
    const h = opts.handlers?.[`${method} ${url}`];
    if (h) return h(body);
    if (method === "GET" && url === "/plugins") return json({ plugins: opts.installed ?? [] });
    if (method === "GET" && url === "/plugins/available") return json({ plugins: opts.available ?? [] });
    return json({ error: "not found", code: "not_found" }, 404);
  }) as typeof fetch;
  return calls;
}

function renderPage() {
  localStorage.setItem("loomux.token", "tok");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const router = createMemoryRouter([{ path: "/settings/plugins", element: <PluginsPage /> }], { initialEntries: ["/settings/plugins"] });
  return render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
}

describe("PluginsPage", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("lists instances with their state, trust, problems and a way to create a machine", async () => {
    serve({
      installed: [
        aPlugin({ check: { ok: true, problems: [{ code: "network_policy_not_enforced", message: "NetworkPolicy isn't enforced on this cluster", severity: "warning" }] }, available_version: "0.5.0" }),
        aPlugin({ id: "p-2", label: "garage", name: "docker", status: "error", status_reason: "engine unreachable", instance: "failed", trust: "unsigned" }),
      ],
      available: [aCatalogEntry()],
    });
    renderPage();
    const k8s = await screen.findByRole("listitem", { name: "wysekube" });
    expect(k8s).toHaveTextContent("Running, with warnings");
    expect(k8s).toHaveTextContent("Part of this Loomux release");
    expect(k8s).toHaveTextContent("NetworkPolicy isn't enforced on this cluster");
    expect(k8s).toHaveTextContent("Version 0.5.0 is available");
    expect(within(k8s).getByRole("link", { name: "Create a machine" })).toHaveAttribute("href", "/machines/create?plugin=p-1");
    expect(within(k8s).getByRole("button", { name: "Upgrade to 0.5.0" })).toBeInTheDocument();
    const garage = screen.getByRole("listitem", { name: "garage" });
    expect(garage).toHaveTextContent("Error: engine unreachable");
    expect(garage).toHaveTextContent("Not signed");
    expect(within(garage).queryByRole("link", { name: "Create a machine" })).toBeNull();
  });

  it("configures without ever showing a secret: empty keeps it, typed replaces it, Clear sends empty", async () => {
    const user = userEvent.setup();
    const stored = aPlugin({ config: { namespace: "loomux-agents", kubeconfig: { set: true }, max_environments: 5 } });
    const calls = serve({
      installed: [stored],
      available: [aCatalogEntry()],
      handlers: { "PUT /plugins/p-1/config": (body) => json({ ...stored, config: { ...stored.config, ...(body?.config as object) } }) },
    });
    const { container } = renderPage();
    const card = await screen.findByRole("listitem", { name: "wysekube" });
    await user.click(within(card).getByRole("button", { name: "Configure" }));
    const form = within(card).getByRole("form", { name: "Configure wysekube" });
    const kube = within(form).getByLabelText(/Kubeconfig/);
    expect(kube).toHaveValue("");
    expect(form).toHaveTextContent("Set. Leave empty to keep it");
    await user.clear(within(form).getByLabelText(/Namespace/));
    await user.type(within(form).getByLabelText(/Namespace/), "agents");
    await user.click(within(form).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PUT")).toBe(true));
    const first = calls.find((c) => c.method === "PUT")!;
    expect(first.body).toEqual({ config: { namespace: "agents", max_environments: 5 } });

    // Typed, then cleared from the page once sent.
    await user.click(within(card).getByRole("button", { name: "Configure" }));
    const again = within(card).getByRole("form", { name: "Configure wysekube" });
    await user.type(within(again).getByLabelText(/Kubeconfig/), "apiVersion: v1{enter}kind: Config");
    await user.click(within(again).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(2));
    expect((calls.filter((c) => c.method === "PUT")[1].body!.config as Record<string, unknown>).kubeconfig).toBe("apiVersion: v1\nkind: Config");
    expect(container.innerHTML).not.toContain("kind: Config");

    // Clear: an explicit empty string.
    await user.click(within(card).getByRole("button", { name: "Configure" }));
    const third = within(card).getByRole("form", { name: "Configure wysekube" });
    await user.click(within(third).getByRole("button", { name: "Clear" }));
    expect(third).toHaveTextContent("The saved value will be erased.");
    await user.click(within(third).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(calls.filter((c) => c.method === "PUT")).toHaveLength(3));
    expect((calls.filter((c) => c.method === "PUT")[2].body!.config as Record<string, unknown>).kubeconfig).toBe("");
  });

  it("installs from the catalog, and shows the check's problems when it can't work", async () => {
    const user = userEvent.setup();
    const calls = serve({
      installed: [aPlugin()],
      available: [aCatalogEntry({ installed: ["p-1"] })],
      handlers: {
        "POST /plugins": (body) =>
          json(
            aPlugin({
              id: "p-9",
              label: String(body?.label),
              status: "error",
              status_reason: "namespace loomux-x doesn't exist",
              check: { ok: false, problems: [{ code: "namespace_missing", message: "namespace loomux-x doesn't exist", severity: "error" }] },
            }),
            422,
          ),
      },
    });
    renderPage();
    const entry = await screen.findByRole("listitem", { name: "Kubernetes" });
    expect(entry).toHaveTextContent("Runs in its own container");
    await user.click(within(entry).getByRole("button", { name: "Install" }));
    const form = within(entry).getByRole("form", { name: "Install Kubernetes" });
    expect(form).toHaveTextContent("create pods, secrets and PVCs in its namespace");
    // The default label is the plugin's name while no instance has it.
    expect(within(form).getByLabelText("Label")).toHaveValue("kubernetes");
    await user.clear(within(form).getByLabelText(/Namespace/));
    await user.type(within(form).getByLabelText(/Namespace/), "loomux-x");
    await user.click(within(form).getByRole("button", { name: "Install kubernetes" }));
    expect(await within(entry).findByRole("status")).toHaveTextContent("but its check failed");
    expect(entry).toHaveTextContent("namespace loomux-x doesn't exist");
    const post = calls.find((c) => c.method === "POST")!;
    expect(post.body).toEqual({ plugin: "kubernetes", source: "socket", label: "kubernetes", config: { namespace: "loomux-x", max_environments: 5 } });
  });

  it("says why a build couldn't be verified, and asks for trust before an unsigned install", async () => {
    const user = userEvent.setup();
    serve({
      available: [aCatalogEntry({ trust: "unsigned", isolation: "none", name: "thing", title: "Thing" })],
      handlers: { "POST /plugins": () => json({ error: "attestation: the bundle's sha256 has no provenance", code: "unprocessable" }, 422) },
    });
    renderPage();
    const entry = await screen.findByRole("listitem", { name: "Thing" });
    await user.click(within(entry).getByRole("button", { name: "Install" }));
    const install = within(entry).getByRole("button", { name: "Install thing" });
    expect(install).toBeDisabled();
    await user.click(within(entry).getByRole("checkbox"));
    await user.click(install);
    expect(await within(entry).findByRole("alert")).toHaveTextContent("its build couldn't be verified: attestation: the bundle's sha256 has no provenance");
  });

  it("guards uninstalling an instance with machines: keep or destroy, destroy typed out", async () => {
    const user = userEvent.setup();
    const calls = serve({ installed: [aPlugin({ machines: 2 })], available: [], handlers: { "DELETE /plugins/p-1?targets=destroy": () => json(null, 204) } });
    renderPage();
    const card = await screen.findByRole("listitem", { name: "wysekube" });
    await user.click(within(card).getByRole("button", { name: "Uninstall" }));
    const group = within(card).getByRole("group", { name: "Uninstall wysekube" });
    expect(group).toHaveTextContent("It made 2 machines");
    const go = within(group).getByRole("button", { name: /Uninstall/ });
    expect(go).toBeDisabled();
    await user.click(within(group).getByLabelText(/Destroy them/));
    expect(within(group).getByRole("button", { name: "Uninstall and destroy 2" })).toBeDisabled();
    await user.type(within(group).getByRole("textbox"), "wysekube");
    await user.click(within(group).getByRole("button", { name: "Uninstall and destroy 2" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(calls.find((c) => c.method === "DELETE")!.url).toBe("/plugins/p-1?targets=destroy");
  });

  it("uninstalls one without machines with no choice to make", async () => {
    const user = userEvent.setup();
    const calls = serve({ installed: [aPlugin()], handlers: { "DELETE /plugins/p-1": () => json(null, 204) } });
    renderPage();
    const card = await screen.findByRole("listitem", { name: "wysekube" });
    await user.click(within(card).getByRole("button", { name: "Uninstall" }));
    await user.click(within(card).getByRole("button", { name: "Uninstall wysekube" }));
    await waitFor(() => expect(calls.some((c) => c.method === "DELETE" && c.url === "/plugins/p-1")).toBe(true));
  });

  it("says so on a server without plugins", async () => {
    globalThis.fetch = vi.fn(async () => json({ error: "no route", code: "not_found" }, 404)) as typeof fetch;
    renderPage();
    expect(await screen.findByText(/This Loomux server has no plugins/)).toBeInTheDocument();
  });
});

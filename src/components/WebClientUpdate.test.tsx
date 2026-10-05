import { describe, expect, it, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { WebClientUpdate } from "./WebClientUpdate";

const baked = { commit: "a".repeat(40), short: "aaaaaaa", tag: "web-aaaaaaa", built_at: "2026-10-05T09:00:00Z" };
const newer = {
  commit: "b".repeat(40),
  short: "bbbbbbb",
  tag: "web-bbbbbbb",
  built_at: "2026-10-05T10:00:00Z",
  subject: "Merge pull request #41",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function renderIt(reload = vi.fn()) {
  localStorage.setItem("loomux.token", "tok-1");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <WebClientUpdate reload={reload} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return reload;
}

describe("WebClientUpdate", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("offers a newer release, installs it, then offers a reload", async () => {
    const user = userEvent.setup();
    const posts: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/web/version") {
        return jsonResponse({ current: baked, source: "image", latest: newer, update_available: true, updates_enabled: true });
      }
      if (url === "/api/v1/web/update" && init?.method === "POST") {
        posts.push(url);
        return jsonResponse({ current: newer, source: "installed", previous: baked, update_available: false, updates_enabled: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const reload = renderIt();

    expect(await screen.findByText(/web-aaaaaaa/)).toBeInTheDocument();
    expect(screen.getByText(/from the server image/)).toBeInTheDocument();
    expect(screen.getByText(/web-bbbbbbb \(Merge pull request #41\)/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Update" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/now serves web-bbbbbbb.*Reload to use it/);
    expect(posts).toEqual(["/api/v1/web/update"]);
    expect(screen.queryByRole("button", { name: "Update" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Reload" }));
    expect(reload).toHaveBeenCalledOnce();
  });

  it("rolls back to the bundle an update replaced", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/web/version") {
        return jsonResponse({ current: newer, source: "installed", previous: baked, latest: newer, update_available: false, updates_enabled: true });
      }
      if (url === "/api/v1/web/rollback" && init?.method === "POST") {
        return jsonResponse({ current: baked, source: "image", previous: newer, update_available: true, updates_enabled: true });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    renderIt();

    expect(await screen.findByText(/Up to date/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Roll back to web-aaaaaaa" }));
    expect(await screen.findByRole("status")).toHaveTextContent(/now serves web-aaaaaaa/);
  });

  it("says when updates aren't set up, and shows a failed update's reason", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input) === "/api/v1/web/version") {
        return jsonResponse({ current: null, source: "image", update_available: false, updates_enabled: false });
      }
      throw new Error("unexpected");
    });
    renderIt();
    expect(await screen.findByText(/Updates aren't set up on this server/)).toBeInTheDocument();
    expect(screen.getByText(/an unversioned build/)).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("shows the server's reason when an update fails", async () => {
    const user = userEvent.setup();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url === "/api/v1/web/version") {
        return jsonResponse({ current: baked, source: "image", latest: newer, update_available: true, updates_enabled: true });
      }
      if (url === "/api/v1/web/update" && init?.method === "POST") {
        return jsonResponse({ error: "update failed: sha256 mismatch" }, 502);
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    renderIt();
    await user.click(await screen.findByRole("button", { name: "Update" }));
    expect(await screen.findByText("update failed: sha256 mismatch")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("renders nothing against a server without web updates", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ error: "not found" }, 404));
    renderIt();
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByText("Web client")).not.toBeInTheDocument());
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { Devices } from "./Devices";

const HOUR = 3_600_000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

describe("Devices", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("lists this device first and signs another out", async () => {
    localStorage.setItem("loomux.token", "tok");
    let sessions = [
      { id: "s-old", created_at: iso(-19 * 24 * HOUR), last_used_at: iso(-19 * 24 * HOUR), current: false },
      { id: "s-me", created_at: iso(-48 * HOUR), last_used_at: iso(0), current: true },
      { id: "s-phone", created_at: iso(-72 * HOUR), last_used_at: iso(-HOUR / 5), current: false },
    ];
    const deleted: string[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (init?.method === "DELETE") {
        const id = url.split("/").pop()!;
        deleted.push(id);
        sessions = sessions.filter((s) => s.id !== id);
        return new Response(null, { status: 204 });
      }
      return new Response(JSON.stringify({ sessions }), { status: 200 });
    }) as typeof fetch;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Devices />
        </AuthProvider>
      </QueryClientProvider>,
    );
    const rows = await screen.findAllByRole("listitem");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("This device"),
      expect.stringContaining("Last used 12m ago"),
      expect.stringContaining("Last used 19d ago"),
    ]);
    // This device signs out with Log out, not here.
    expect(within(rows[0]).queryByRole("button")).not.toBeInTheDocument();
    await userEvent.click(within(rows[2]).getByRole("button", { name: "Log out this device" }));
    expect(deleted).toEqual([]);
    await userEvent.click(within(rows[2]).getByRole("button", { name: "Yes, log it out" }));
    await waitFor(() => expect(deleted).toEqual(["s-old"]));
    await waitFor(() => expect(screen.getAllByRole("listitem")).toHaveLength(2));
  });

  // LOOM-274: a session says which client and device it is (loomux/server
  // LOOM-268's client_kind and label), so the right one is revoked.
  it("names each session's client and device", async () => {
    localStorage.setItem("loomux.token", "tok");
    const sessions = [
      { id: "s-me", created_at: iso(-48 * HOUR), last_used_at: iso(0), label: "", client_kind: "web", current: true },
      { id: "s-term", created_at: iso(-24 * HOUR), last_used_at: iso(-HOUR / 5), label: "laptop", client_kind: "tui", current: false },
      { id: "s-web", created_at: iso(-72 * HOUR), last_used_at: iso(-HOUR), label: "", client_kind: "web", current: false },
      // From before LOOM-268: neither is known.
      { id: "s-old", created_at: iso(-96 * HOUR), last_used_at: iso(-2 * HOUR), label: "", client_kind: "", current: false },
    ];
    globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ sessions }), { status: 200 })) as typeof fetch;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <Devices />
        </AuthProvider>
      </QueryClientProvider>,
    );
    const rows = await screen.findAllByRole("listitem");
    const titles = rows.map((r) => r.querySelector("p")?.textContent);
    expect(titles).toEqual(["This device", "loomux TUI · laptop", "Web", `Signed in ${new Date(sessions[3].created_at).toLocaleDateString([], { day: "numeric", month: "short", year: "numeric" })}`]);
    // A terminal signs in again with loomux login, not the password.
    await userEvent.click(within(rows[1]).getByRole("button", { name: "Log out this device" }));
    expect(rows[1]).toHaveTextContent("It'll need loomux login to sign in again.");
    await userEvent.click(within(rows[2]).getByRole("button", { name: "Log out this device" }));
    expect(rows[2]).toHaveTextContent("It'll need the password to sign in again.");
  });
});

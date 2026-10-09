import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import { AppShell } from "./AppShell";
import { KeepQueryRedirect } from "./KeepQueryRedirect";

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function renderShell(initial = "/") {
  localStorage.setItem("loomux.token", "tok-1");
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: "/login", element: <p>login page</p> },
      {
        element: <AppShell />,
        children: [
          { path: "/", element: <p>inbox page</p> },
          { path: "/today", element: <p>today page</p> },
          { path: "/machines", element: <p>machines page</p> },
          { path: "/vault", element: <p>vault page</p> },
          { path: "/settings", element: <p>settings page</p> },
          { path: "/composer", element: <textarea aria-label="Composer" autoFocus /> },
          { path: "/targets", element: <KeepQueryRedirect to="/machines" /> },
          { path: "/old/:id", element: <KeepQueryRedirect to="/new/:id" /> },
          { path: "/new/:id", element: <p>new page</p> },
        ],
      },
    ],
    { initialEntries: [initial] },
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

// jsdom applies no media queries, so the desktop sidebar and the phone
// bottom bar are both in the document; each is a nav named "Main".
function navs() {
  const [sidebar, bottomBar] = screen.getAllByRole("navigation", { name: "Main" });
  return { sidebar, bottomBar };
}

describe("AppShell", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  function serve(conversations: { status: string }[] = []) {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations") {
        return jsonResponse({
          conversations: conversations.map((c, i) => ({
            conversation_id: `c${i}`,
            workspace_id: "",
            updated_at: "2026-10-08T10:00:00Z",
            ...c,
          })),
        });
      }
      if (url === "/api/v1/version") return jsonResponse({ server_version: "x", api_version: "v1" });
      return jsonResponse({ error: "not found" }, 404);
    }) as typeof fetch;
  }

  it("puts daily work first and setup lower, and marks where you are", async () => {
    serve();
    renderShell("/today");
    const { sidebar } = navs();
    const links = within(sidebar).getAllByRole("link").map((a) => a.textContent);
    expect(links).toEqual(["Inbox", "Today", "Machines", "Vault", "Settings"]);
    expect(within(sidebar).getByRole("link", { name: "Today" })).toHaveAttribute("aria-current", "page");
    expect(within(sidebar).getByRole("link", { name: "Inbox" })).not.toHaveAttribute("aria-current");
    expect(await screen.findByText("today page")).toBeInTheDocument();
  });

  it("counts what needs you on Inbox, in both navs", async () => {
    serve([{ status: "needs_attention" }, { status: "awaiting_input" }, { status: "running" }, { status: "completed" }]);
    renderShell();
    const { sidebar, bottomBar } = navs();
    expect(await within(sidebar).findByRole("link", { name: /^Inbox\W+2 need you$/ })).toBeInTheDocument();
    expect(within(bottomBar).getByRole("link", { name: /Inbox/ })).toHaveTextContent("2 need you");
  });

  it("counts a pending offer the list status doesn't show", async () => {
    const soon = new Date(Date.now() + 5 * 60_000).toISOString();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/v1/conversations") {
        return jsonResponse({
          conversations: [
            { conversation_id: "c1", workspace_id: "", status: "completed", updated_at: new Date().toISOString() },
          ],
        });
      }
      if (url === "/api/v1/conversations/c1") {
        return jsonResponse({
          conversation_id: "c1",
          tasks: [],
          messages: [],
          dispatches: [],
          confirmations: [
            { id: "o1", kind: "run_command", status: "pending", created_at: new Date().toISOString(), expires_at: soon },
          ],
        });
      }
      return jsonResponse({ error: "not found" }, 404);
    }) as typeof fetch;
    renderShell();
    expect(await within(navs().sidebar).findByRole("link", { name: /^Inbox\W+1 need you$/ })).toBeInTheDocument();
  });

  it("shows no count when nothing needs you", async () => {
    serve([{ status: "running" }]);
    renderShell();
    await screen.findByText("inbox page");
    expect(screen.queryByText(/need you/)).not.toBeInTheDocument();
  });

  it("keeps Vault, Settings and Log out behind More on a phone", async () => {
    serve();
    const router = renderShell();
    const { bottomBar } = navs();
    expect(within(bottomBar).queryByRole("link", { name: "Vault" })).not.toBeInTheDocument();

    await userEvent.click(within(bottomBar).getByRole("button", { name: "More" }));
    const sheet = await screen.findByRole("dialog", { name: "More" });
    await userEvent.click(within(sheet).getByRole("button", { name: "Vault" }));
    expect(router.state.location.pathname).toBe("/vault");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("says when the device is offline", async () => {
    serve();
    const onLine = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderShell();
    expect(await screen.findByText(/You're offline/)).toBeInTheDocument();
    onLine.mockReturnValue(true);
    act(() => {
      window.dispatchEvent(new Event("online"));
    });
    expect(screen.queryByText(/You're offline/)).not.toBeInTheDocument();
  });

  it("moves focus to the new screen after navigating, not on first load", async () => {
    serve();
    const router = renderShell();
    await screen.findByText("inbox page");
    expect(document.body).toHaveFocus();

    await userEvent.click(within(navs().sidebar).getByRole("link", { name: "Today" }));
    await screen.findByText("today page");
    expect(screen.getByRole("main")).toHaveFocus();

    // A screen that places focus itself keeps it.
    await act(() => router.navigate("/composer"));
    expect(screen.getByRole("textbox", { name: "Composer" })).toHaveFocus();
  });

  it("starts with a skip link to the content", async () => {
    serve();
    renderShell();
    await screen.findByText("inbox page");
    await userEvent.tab();
    const skip = screen.getByRole("link", { name: "Skip to content" });
    expect(skip).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    expect(screen.getByRole("main")).toHaveFocus();
  });

  it("logs out from the sidebar", async () => {
    serve();
    const router = renderShell();
    await userEvent.click(within(navs().sidebar).getByRole("button", { name: "Log out" }));
    expect(localStorage.getItem("loomux.token")).toBeNull();
    // The shell itself has no guard here (ProtectedRoute does that in the
    // app), so just check the token is gone and we're still routed.
    expect(router.state.location.pathname).toBe("/");
  });
});

describe("KeepQueryRedirect", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("keeps the query and hash of a moved address", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ conversations: [] })) as typeof fetch;
    const router = renderShell("/targets?probe=1#x");
    expect(await screen.findByText("machines page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/machines");
    expect(router.state.location.search).toBe("?probe=1");
    expect(router.state.location.hash).toBe("#x");
  });

  it("carries path parameters across", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ conversations: [] })) as typeof fetch;
    const router = renderShell("/old/abc");
    expect(await screen.findByText("new page")).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/new/abc");
  });
});

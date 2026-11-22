import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import type { TaskHold } from "../lib/api";
import { HolderBanner } from "./HolderBanner";

const hold: TaskHold = {
  id: "h1",
  task_id: "task-1",
  session_id: "s-term",
  client_kind: "tui",
  client_label: "laptop",
  mode: "drive",
  prev_status: "awaiting_input",
  ttl_seconds: 45,
  acquired_at: new Date().toISOString(),
  renewed_at: new Date().toISOString(),
  expires_at: new Date(Date.now() + 45_000).toISOString(),
};

function renderBanner(reply: () => Response, onTakenBack = vi.fn()) {
  localStorage.setItem("loomux.token", "tok");
  const calls: { url: string; init?: RequestInit }[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init });
    return reply();
  }) as typeof fetch;
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <HolderBanner hold={hold} onTakenBack={onTakenBack} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { calls, onTakenBack };
}

describe("HolderBanner", () => {
  const originalFetch = globalThis.fetch;
  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
  });

  it("names the holder and since when", () => {
    renderBanner(() => new Response("{}"));
    const banner = screen.getByRole("region", { name: "Driven from the terminal on laptop" });
    expect(banner).toHaveTextContent("Driven from the terminal on laptop");
    expect(banner).toHaveTextContent(
      `since ${new Date(hold.acquired_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
    );
    // What it means for a message sent now.
    expect(banner).toHaveTextContent("Loomux won't type into it until it's given back.");
  });

  it("takes it back only once confirmed, with a release that names no hold", async () => {
    const { calls, onTakenBack } = renderBanner(
      () => new Response(JSON.stringify({ task_id: "task-1", status: "awaiting_input", hold: { ...hold, ended_reason: "taken_back" } })),
    );
    await userEvent.click(screen.getByRole("button", { name: "Take back" }));
    expect(calls).toEqual([]);
    expect(screen.getByText(/The terminal on laptop is detached/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Yes, take it back" }));
    await waitFor(() => expect(onTakenBack).toHaveBeenCalledTimes(1));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("/api/v1/tasks/task-1/release");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({});
  });

  it("keeps it there when the confirmation is declined", async () => {
    const { calls } = renderBanner(() => new Response("{}"));
    await userEvent.click(screen.getByRole("button", { name: "Take back" }));
    await userEvent.click(screen.getByRole("button", { name: "Keep it there" }));
    expect(calls).toEqual([]);
    expect(screen.getByRole("button", { name: "Take back" })).toBeInTheDocument();
  });

  it("says nothing changed when the terminal couldn't be detached", async () => {
    const { onTakenBack } = renderBanner(
      () => new Response(JSON.stringify({ error: "couldn't detach the clients", code: "detach_failed" }), { status: 502 }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Take back" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, take it back" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Couldn't take it back: the terminal on laptop couldn't be detached (its machine didn't answer). Nothing changed. Try again.",
    );
    expect(onTakenBack).not.toHaveBeenCalled();
    // Still there to try again.
    expect(screen.getByRole("button", { name: "Yes, take it back" })).toBeEnabled();
  });

  it("shows the server's reason for any other refusal", async () => {
    renderBanner(() => new Response(JSON.stringify({ error: "task not found", code: "not_found" }), { status: 404 }));
    await userEvent.click(screen.getByRole("button", { name: "Take back" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes, take it back" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Couldn't take it back: task not found");
  });
});

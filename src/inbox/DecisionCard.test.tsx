import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "../lib/auth";
import type { Decision } from "../lib/needsYou";
import { DecisionCard } from "./DecisionCard";

const MIN = 60_000;
const iso = (offset: number) => new Date(Date.now() + offset).toISOString();

function offerDecision(over: Partial<Decision> = {}): Decision {
  return {
    key: "offer:o1",
    kind: "offer",
    conversationId: "c1",
    since: iso(-2 * MIN),
    preview: "Restart the staging ledger deploy",
    workspaceHint: "w-infra",
    confirmation: {
      id: "o1",
      kind: "run_command",
      command: "kubectl -n staging rollout restart deploy/ledger-api",
      target_name: "kestrel",
      workspace_name: "infra-terraform",
      agent_type: "claude-code",
      status: "pending",
      created_at: iso(-2 * MIN),
      expires_at: iso(4 * MIN),
    },
    ...over,
  };
}

interface Sent {
  body: Record<string, unknown>;
  headers: Headers;
}

function setup(decision: Decision, respond: () => Response = () => new Response(JSON.stringify({ dispatch_id: "d9", status: "queued" }), { status: 202 })) {
  localStorage.setItem("loomux.token", "tok");
  const sent: Sent[] = [];
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input) === "/api/v1/dispatch") {
      sent.push({ body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
      return respond();
    }
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  const onAnswered = vi.fn();
  const onSnooze = vi.fn();
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <MemoryRouter>
          <DecisionCard decision={decision} workspaceName={(id) => (id === "w1" ? "ledger-api" : undefined)} onAnswered={onAnswered} onSnooze={onSnooze} />
        </MemoryRouter>
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { sent, onAnswered, onSnooze };
}

describe("DecisionCard", () => {
  const originalFetch = globalThis.fetch;
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.useRealTimers();
  });

  it("shows an offer in full: what, where, and when it expires", () => {
    setup(offerDecision());
    const card = screen.getByRole("region", { name: "Confirmation" });
    expect(within(card).getByRole("heading", { name: "Run this command on kestrel?" })).toBeInTheDocument();
    expect(card).toHaveTextContent("kubectl -n staging rollout restart deploy/ledger-api");
    expect(card).toHaveTextContent("In infra-terraform, claude-code.");
    expect(card).toHaveTextContent(/Expires in [34]:\d\d/);
    expect(within(card).getByRole("link", { name: "Restart the staging ledger deploy" })).toHaveAttribute("href", "/conversations/c1");
  });

  it("approves with a yes that names the offer, then reports it", async () => {
    const { sent, onAnswered } = setup(offerDecision());
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ conversation_id: "c1", message: "yes", workspace_hint: "w-infra", confirmation_id: "o1" });
    expect(sent[0].headers.get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/);
    expect(onAnswered).toHaveBeenCalledWith(expect.objectContaining({ key: "offer:o1" }), { label: "Approved." });
  });

  it("denies with a no that names the offer", async () => {
    const { sent, onAnswered } = setup(offerDecision());
    await userEvent.click(screen.getByRole("button", { name: "Deny" }));
    expect(sent[0].body).toMatchObject({ message: "no", confirmation_id: "o1" });
    expect(onAnswered).toHaveBeenCalledWith(expect.anything(), { label: "Denied: nothing was run." });
  });

  it("never approves on Enter, and doesn't take focus", async () => {
    const { sent } = setup(offerDecision());
    expect(document.activeElement).toBe(document.body);
    await userEvent.keyboard("{Enter}");
    expect(sent).toHaveLength(0);
  });

  it("goes inert the moment the offer expires", () => {
    setup(offerDecision({ confirmation: { ...offerDecision().confirmation!, expires_at: iso(-1000) } }));
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("Expired: nothing was run.");
  });

  it("explains a busy conversation instead of dropping the answer silently", async () => {
    const { onAnswered } = setup(offerDecision(), () =>
      new Response(JSON.stringify({ error: "a turn is running", code: "conversation_busy", dispatch_id: "d1" }), { status: 409 }),
    );
    await userEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("A turn is already running in this conversation");
    expect(onAnswered).not.toHaveBeenCalled();
  });

  it("answers an agent's question with the option's number", async () => {
    const { sent } = setup({
      key: "task:k1",
      kind: "prompt",
      conversationId: "c1",
      since: iso(-6 * MIN),
      workspaceId: "w1",
      task: {
        id: "k1",
        workspace_id: "w1",
        kind: "agent",
        agent_type: "claude-code",
        status: "needs_attention",
        created_at: iso(-9 * MIN),
        updated_at: iso(-6 * MIN),
        attention: {
          kind: "question",
          title: "Edit src/middleware/ratelimit.ts?",
          question: "Do you want to make this edit?",
          options: [{ label: "Yes" }, { label: "Yes, and don't ask again this session" }, { label: "Type something…" }],
          selected: 0,
        },
      },
    });
    expect(screen.getByRole("heading", { name: "claude-code is asking you something" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Type something/ })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: /don't ask again/ }));
    expect(sent[0].body).toMatchObject({ message: "2" });
  });

  it("keeps the agent's numbering when it leaves out \"Type something…\"", async () => {
    const { sent } = setup({
      key: "task:k2",
      kind: "prompt",
      conversationId: "c1",
      since: iso(-MIN),
      task: {
        id: "k2",
        workspace_id: "w1",
        kind: "agent",
        agent_type: "codex",
        status: "needs_attention",
        created_at: iso(-2 * MIN),
        updated_at: iso(-MIN),
        attention: { kind: "question", options: [{ label: "Yes" }, { label: "Type something…" }, { label: "No" }], selected: 0 },
      },
    });
    const no = screen.getByRole("button", { name: /No$/ });
    expect(no).toHaveTextContent("3");
    await userEvent.click(no);
    expect(sent[0].body).toMatchObject({ message: "3" });
  });

  it("sends a free-text reply", async () => {
    const { sent } = setup({ key: "a", kind: "awaiting", conversationId: "c1", since: iso(-MIN) });
    await userEvent.type(screen.getByLabelText("Reply to the agent"), "use the staging DB{Enter}");
    expect(sent[0].body).toMatchObject({ message: "use the staging DB" });
  });

  it("explains a failed turn in plain words and retries its message", async () => {
    const { sent } = setup({
      key: "failed:d2",
      kind: "failed",
      conversationId: "c1",
      since: iso(-MIN),
      retryMessage: "bump the terraform providers",
      dispatch: {
        dispatch_id: "d2",
        conversation_id: "c1",
        status: "failed",
        error_class: "agent_rate_limited",
        error: "usage limit reached",
        created_at: iso(-2 * MIN),
      },
    });
    expect(screen.getByRole("heading")).toHaveTextContent(/usage limit/);
    expect(screen.getByText("Details")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(sent[0].body).toMatchObject({ message: "bump the terraform providers" });
    expect(sent[0].body).not.toHaveProperty("confirmation_id");
  });

  it("offers a snooze for everything but offers", async () => {
    const { onSnooze } = setup({ key: "a", kind: "awaiting", conversationId: "c1", since: iso(-MIN) });
    await userEvent.click(screen.getByRole("button", { name: "Snooze until tomorrow" }));
    expect(onSnooze).toHaveBeenCalled();
  });

  it("has no snooze on an offer: it expires instead", () => {
    setup(offerDecision());
    expect(screen.queryByRole("button", { name: "Snooze until tomorrow" })).not.toBeInTheDocument();
  });

  // LOOM-175: the agent's question is on the card, and a preview that
  // ends a sentence gets no second full stop.
  it("shows what an agent waiting for a reply asked, without a double full stop", () => {
    setup({ key: "a", kind: "awaiting", conversationId: "c1", since: iso(-MIN), preview: "Fix the build.", question: "Which branch should I use?" });
    const card = screen.getByRole("region", { name: /waiting for your reply/ });
    expect(card).toHaveTextContent("Which branch should I use?");
    expect(card).toHaveTextContent("From Fix the build.");
    expect(card.textContent).not.toContain("..");
  });
});

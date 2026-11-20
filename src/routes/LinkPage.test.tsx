import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { LoginPage } from "./LoginPage";
import { LinkPage } from "./LinkPage";

// The shared vector (src/lib/link.test.ts): this hash's code is 7ESB-UHZP.
const H = "ea866a757e4c38babfa8127cbe9a409d3e1f93a00ff1488ff735fcf917afffd0";
const CODE = "7ESB-UHZP";
const OTHER = "0".repeat(64); // code VS4Z-3W2A

const created = { id: "s-new", created_at: "2026-11-20T00:00:00Z", last_used_at: "2026-11-20T00:00:00Z", label: "laptop", client_kind: "tui", current: false };

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), { status });
}

function Where() {
  const l = useLocation();
  return <p data-testid="where">{l.pathname + l.hash}</p>;
}

// Stands in for something else changing the address's fragment while the
// page is open (another link pasted into the same tab, or a window that
// can navigate this one).
function Swap({ to }: { to: string }) {
  const navigate = useNavigate();
  return <button onClick={() => navigate(to)}>swap the link</button>;
}

function renderAt(entry: string, { loggedIn = true, swapTo }: { loggedIn?: boolean; swapTo?: string } = {}) {
  if (loggedIn) localStorage.setItem("loomux.token", "web-token");
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route
              path="/link"
              element={
                <>
                  <LinkPage />
                  <Where />
                  {swapTo && <Swap to={swapTo} />}
                </>
              }
            />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>,
  );
}

const approveButton = () => screen.getByRole("button", { name: "Approve" });

// Approve once it's armed: a second after the code shows, in a focused
// window.
async function armedApprove() {
  await waitFor(() => expect(approveButton()).toBeEnabled(), { timeout: 3000 });
  return approveButton();
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("LinkPage", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    // jsdom has no window focus; a browser that just opened the link has.
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
  });

  it("shows the terminal's label and its code, and sends nothing until asked", async () => {
    renderAt(`/link#h=${H}&label=laptop`);
    expect(await screen.findByText(CODE)).toBeInTheDocument();
    expect(screen.getByText("laptop")).toBeInTheDocument();
    expect(screen.getByText(/approve only if your terminal is showing this code right now/i)).toBeInTheDocument();
    expect(approveButton()).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names no device when the link has no label", async () => {
    renderAt(`/link#h=${H}`);
    expect(await screen.findByText(CODE)).toBeInTheDocument();
    expect(screen.getByText(/a terminal wants to sign in/i)).toBeInTheDocument();
  });

  it("shows the label as isolated text, so it can't reorder the page around it", async () => {
    const label = "‮evil<b>x</b>";
    renderAt(`/link#h=${H}&label=${encodeURIComponent(label)}`);
    await screen.findByText(CODE);
    expect(screen.getByText(label).tagName).toBe("BDI");
  });

  it("approves exactly the hash on screen, with the label and kind, and logs nothing of the link", async () => {
    const logs = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m));
    fetchMock.mockResolvedValue(json(created, 201));
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    await userEvent.click(await armedApprove());

    expect(await screen.findByRole("status")).toHaveTextContent(/^Approved\./);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/v1/sessions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ token_hash: H, label: "laptop", client_kind: "tui" });
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer web-token");
    for (const log of logs) expect(log).not.toHaveBeenCalled();
    // Done with: the address no longer carries it, so Back or a reload
    // doesn't offer it again.
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/link$/));
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("sends one approval however often Approve is pressed", async () => {
    fetchMock.mockReturnValue(new Promise(() => {}));
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    await userEvent.click(await armedApprove());
    await userEvent.click(screen.getByRole("button", { name: /approving/i }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("Don't approve sends nothing and leaves nothing to approve", async () => {
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    await userEvent.click(screen.getByRole("button", { name: "Don't approve" }));
    expect(screen.getByRole("status")).toHaveTextContent(/^Not approved\./);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/link$/));
  });

  it("a replayed link (409) says it was used already and changes nothing", async () => {
    fetchMock.mockResolvedValue(json({ error: "a session already exists for this token" }, 409));
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    await userEvent.click(await armedApprove());
    expect(await screen.findByText(/this link was used already/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /undo/i })).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("where")).toHaveTextContent(/^\/link$/));
  });

  it("without a fragment, says how to get the link again", async () => {
    renderAt("/link");
    expect(await screen.findByText(/this link has no terminal in it/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("refuses a malformed link and sends nothing", async () => {
    renderAt(`/link#h=${H.toUpperCase()}&label=laptop`);
    expect(await screen.findByText(/isn't a link loomux made/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a link whose fragment changes after it's shown, and never sends the new hash", async () => {
    renderAt(`/link#h=${H}&label=laptop`, { swapTo: `/link#h=${OTHER}&label=laptop` });
    await screen.findByText(CODE);
    await userEvent.click(screen.getByRole("button", { name: "swap the link" }));
    expect(await screen.findByText(/the link in the address changed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(screen.queryByText("VS4Z-3W2A")).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("inside another page's frame, offers nothing to approve", async () => {
    vi.spyOn(window, "top", "get").mockReturnValue({} as Window);
    renderAt(`/link#h=${H}&label=laptop`);
    expect(await screen.findByText(/can't approve anything inside another page/i)).toBeInTheDocument();
    expect(screen.queryByText(CODE)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it("without WebCrypto, shows no code and nothing to approve", async () => {
    vi.stubGlobal("crypto", {});
    renderAt(`/link#h=${H}&label=laptop`);
    expect(await screen.findByText(/can't check this link's code/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
  });

  it.each([404, 405])("says the server is too old for linking on a %i", async (status) => {
    fetchMock.mockResolvedValue(new Response("404 page not found", { status }));
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    await userEvent.click(await armedApprove());
    expect(await screen.findByRole("alert")).toHaveTextContent(/too old to link a terminal/i);
  });

  it("shows the server's reason for any other refusal", async () => {
    fetchMock.mockResolvedValue(json({ error: "only a session that logged in with the password can link another" }, 403));
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    await userEvent.click(await armedApprove());
    expect(await screen.findByRole("alert")).toHaveTextContent("only a session that logged in with the password can link another");
  });

  it("keeps Approve after a network failure, and a retry goes through", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch")).mockResolvedValueOnce(json(created, 201));
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    await userEvent.click(await armedApprove());
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't reach loomux/i);
    await userEvent.click(await armedApprove());
    expect(await screen.findByRole("status")).toHaveTextContent(/^Approved\./);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("asks for the web's login first, then comes back to the same link", async () => {
    fetchMock.mockResolvedValue(json({ token: "web-token" }, 200));
    renderAt(`/link#h=${H}&label=laptop`, { loggedIn: false });
    await userEvent.type(await screen.findByLabelText(/password/i), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    expect(await screen.findByText(CODE)).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(`/link#h=${H}&label=laptop`);
  });

  it("an expired web session on Approve goes to the login and back, with nothing approved", async () => {
    fetchMock.mockResolvedValueOnce(json({ error: "unauthorized" }, 401));
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    await userEvent.click(await armedApprove());
    expect(await screen.findByLabelText(/password/i)).toBeInTheDocument();

    fetchMock.mockResolvedValueOnce(json({ token: "web-token-2" }, 200));
    await userEvent.type(screen.getByLabelText(/password/i), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    expect(await screen.findByText(CODE)).toBeInTheDocument();
    // Back on the link, asking again: the expired attempt approved nothing.
    expect(approveButton()).toBeInTheDocument();
  });

  it("a 401 for a token another tab has replaced says to try again, with nothing approved", async () => {
    fetchMock.mockImplementationOnce(async () => {
      localStorage.setItem("loomux.token", "newer-token"); // another tab logged in meanwhile
      return json({ error: "unauthorized" }, 401);
    });
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    await userEvent.click(await armedApprove());
    expect(await screen.findByRole("alert")).toHaveTextContent(/sign-in to loomux had ended/i);
    expect(approveButton()).toBeInTheDocument();
  });

  it("Undo revokes the session it just approved", async () => {
    fetchMock.mockResolvedValueOnce(json(created, 201)).mockResolvedValueOnce(new Response(null, { status: 204 }));
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    await userEvent.click(await armedApprove());
    await userEvent.click(await screen.findByRole("button", { name: "Undo approval" }));
    expect(await screen.findByText(/undone/i)).toBeInTheDocument();
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toBe("/api/v1/sessions/s-new");
    expect(init.method).toBe("DELETE");
    expect(screen.queryByRole("button", { name: "Undo approval" })).not.toBeInTheDocument();
  });

  it("Undo of a session that's gone already counts as undone", async () => {
    fetchMock.mockResolvedValueOnce(json(created, 201)).mockResolvedValueOnce(json({ error: "session not found" }, 404));
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    await userEvent.click(await armedApprove());
    await userEvent.click(await screen.findByRole("button", { name: "Undo approval" }));
    expect(await screen.findByText(/undone/i)).toBeInTheDocument();
  });

  // A click meant for another page (a double-click there that brings this
  // tab to the front) must not land on Approve before anyone has read the
  // code.
  it("arms Approve only after the code has been on screen for a second", async () => {
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    const shown = Date.now();
    expect(approveButton()).toBeDisabled();
    await armedApprove();
    expect(Date.now() - shown).toBeGreaterThanOrEqual(900);
  });

  it("an unfocused page arms Approve only a second after it gets the focus", async () => {
    vi.mocked(document.hasFocus).mockReturnValue(false);
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    await sleep(1300);
    expect(approveButton()).toBeDisabled();
    act(() => void window.dispatchEvent(new FocusEvent("focus")));
    expect(approveButton()).toBeDisabled();
    await armedApprove();
  });

  it("losing the focus disarms Approve", async () => {
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    await armedApprove();
    act(() => void window.dispatchEvent(new FocusEvent("blur")));
    expect(approveButton()).toBeDisabled();
  });

  // The decision renders before the router has taken the link out of the
  // address; until it has (or if the same link is opened again), the
  // address holding the decided link is no change.
  it("after a decision, the same link in the address still shows the decision", async () => {
    fetchMock.mockResolvedValue(json(created, 201));
    renderAt(`/link#h=${H}&label=laptop`, { swapTo: `/link#h=${H}&label=laptop` });
    await screen.findByText(CODE);
    await userEvent.click(await armedApprove());
    expect(await screen.findByRole("status")).toHaveTextContent(/^Approved\./);
    await userEvent.click(screen.getByRole("button", { name: "swap the link" }));
    expect(screen.getByTestId("where")).toHaveTextContent(`/link#h=${H}&label=laptop`);
    expect(screen.getByRole("status")).toHaveTextContent(/^Approved\./);
    expect(screen.queryByText(/the link in the address changed/i)).not.toBeInTheDocument();
  });

  it("a new link opened while the approval is in flight stays in the address to be checked", async () => {
    let answer!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    renderAt(`/link#h=${H}&label=laptop`, { swapTo: `/link#h=${OTHER}&label=desk` });
    await screen.findByText(CODE);
    await userEvent.click(await armedApprove());
    await userEvent.click(screen.getByRole("button", { name: "swap the link" }));
    await act(async () => answer(json(created, 201)));
    expect(await screen.findByText(/the link in the address changed/i)).toBeInTheDocument();
    expect(screen.getByTestId("where")).toHaveTextContent(`/link#h=${OTHER}&label=desk`);
  });

  it("a new link opened in the same tab after a decision asks for a reload, not the old result", async () => {
    fetchMock.mockResolvedValue(json(created, 201));
    renderAt(`/link#h=${H}&label=laptop`, { swapTo: `/link#h=${OTHER}&label=laptop` });
    await screen.findByText(CODE);
    await userEvent.click(await armedApprove());
    await screen.findByRole("status");
    await userEvent.click(screen.getByRole("button", { name: "swap the link" }));
    expect(await screen.findByText(/the link in the address changed/i)).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Undo approval" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("a failed Undo says so and can be tried again", async () => {
    fetchMock.mockResolvedValueOnce(json(created, 201)).mockRejectedValueOnce(new TypeError("Failed to fetch"));
    renderAt(`/link#h=${H}&label=laptop`);
    await screen.findByText(CODE);
    await userEvent.click(await armedApprove());
    await userEvent.click(await screen.findByRole("button", { name: "Undo approval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't undo/i);
    expect(screen.getByRole("button", { name: "Undo approval" })).toBeInTheDocument();
  });
});

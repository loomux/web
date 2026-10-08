import { describe, expect, it, vi, afterEach } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { AuthProvider } from "../lib/auth";
import { ProtectedRoute } from "../components/ProtectedRoute";
import { LoginPage } from "./LoginPage";

describe("LoginPage", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("stores the token on successful login", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ token: "tok-1" }), { status: 200 }));

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/password/i), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => expect(localStorage.getItem("loomux.token")).toBe("tok-1"));
  });

  it("says the password was wrong on a 401", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: "invalid password" }), { status: 401 }),
      );

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );

    await userEvent.type(screen.getByLabelText(/password/i), "wrong");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid password. Check it and try again.");
    expect(localStorage.getItem("loomux.token")).toBeNull();
  });

  it("keeps this browser's device token and sends it with the next login, across a logout", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ token: "tok-1", device: "dev-1" }), { status: 200 }));
    globalThis.fetch = fetchMock;

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText(/password/i), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    await waitFor(() => expect(localStorage.getItem("loomux.device")).toBe("dev-1"));
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ password: "hunter2" });

    localStorage.removeItem("loomux.token"); // as logout does; the device stays
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ token: "tok-2", device: "dev-1" }), { status: 200 }));
    cleanup();
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <LoginPage />
        </AuthProvider>
      </MemoryRouter>,
    );
    await userEvent.type(screen.getByLabelText(/password/i), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));
    await waitFor(() => expect(localStorage.getItem("loomux.token")).toBe("tok-2"));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toEqual({ password: "hunter2", device: "dev-1" });
  });

  it("returns to the page that asked for a login, not the Inbox", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ token: "tok-1" }), { status: 200 }));

    render(
      <MemoryRouter initialEntries={["/conversations/abc123?x=1"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/conversations/:id" element={<p>conversation page</p>} />
              <Route path="/" element={<p>inbox page</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await userEvent.type(await screen.findByLabelText(/password/i), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText("conversation page")).toBeInTheDocument();
    expect(screen.queryByText("inbox page")).not.toBeInTheDocument();
  });

  it("lands on the Inbox when nothing asked for a login", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify({ token: "tok-1" }), { status: 200 }));

    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<p>inbox page</p>} />
            </Route>
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );

    await userEvent.type(await screen.findByLabelText(/password/i), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: /log in/i }));

    expect(await screen.findByText("inbox page")).toBeInTheDocument();
  });

  it("says why it's showing after the server signed this device out", async () => {
    sessionStorage.setItem("loomux.signedOut", "1");
    globalThis.fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ token: "tok-1" }), { status: 200 }));
    render(
      <MemoryRouter initialEntries={["/login"]}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<p>inbox page</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("You were signed out");
    await userEvent.type(screen.getByLabelText("Password"), "hunter2");
    await userEvent.click(screen.getByRole("button", { name: "Log in" }));
    expect(await screen.findByText("inbox page")).toBeInTheDocument();
    expect(sessionStorage.getItem("loomux.signedOut")).toBeNull();
  });
});

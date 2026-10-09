import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { RouteErrorBoundary } from "./RouteErrorBoundary";

function Thrower({ error }: { error: Error }): never {
  throw error;
}

const chunkError = () =>
  new TypeError("Failed to fetch dynamically imported module: https://x/assets/ConversationDetailPage-old.js");

describe("RouteErrorBoundary", () => {
  const reload = vi.fn();
  const originalLocation = window.location;

  beforeEach(() => {
    sessionStorage.clear();
    reload.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    Object.defineProperty(window, "location", { configurable: true, value: { ...originalLocation, reload } });
  });
  afterEach(() => {
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
    vi.restoreAllMocks();
  });

  // A tab left open across a deploy asks for a chunk hash that no longer
  // exists: reload once by itself, so the user never sees an error for it.
  it("reloads once by itself when a lazy chunk fails to load", () => {
    render(<RouteErrorBoundary><Thrower error={chunkError()} /></RouteErrorBoundary>);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("doesn't loop: a second chunk failure right after the reload shows the button", () => {
    render(<RouteErrorBoundary><Thrower error={chunkError()} /></RouteErrorBoundary>);
    render(<RouteErrorBoundary><Thrower error={chunkError()} /></RouteErrorBoundary>);
    expect(reload).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(/something went wrong/i).length).toBeGreaterThan(0);
  });

  it("doesn't reload by itself for other errors", () => {
    render(<RouteErrorBoundary><Thrower error={new Error("boom")} /></RouteErrorBoundary>);
    expect(reload).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: /reload/i })).toBeInTheDocument();
  });

  // As App wires it: the error screen goes once the user goes elsewhere.
  it("shows the next page after navigating away from one that threw", async () => {
    function Shell() {
      const { pathname } = useLocation();
      return (
        <>
          <Link to="/fine">Elsewhere</Link>
          <RouteErrorBoundary resetKey={pathname}>
            <Routes>
              <Route path="/broken" element={<Thrower error={new Error("boom")} />} />
              <Route path="/fine" element={<p>Fine page</p>} />
            </Routes>
          </RouteErrorBoundary>
        </>
      );
    }
    render(<MemoryRouter initialEntries={["/broken"]}><Shell /></MemoryRouter>);
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument();

    await userEvent.click(screen.getByRole("link", { name: "Elsewhere" }));
    expect(screen.getByText("Fine page")).toBeInTheDocument();
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });
});

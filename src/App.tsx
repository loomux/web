import { lazy, Suspense } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { useNeedsYouCount } from "./lib/useNeedsYouCount";
import { AppShell } from "./shell/AppShell";
import { KeepQueryRedirect } from "./shell/KeepQueryRedirect";
import { RouteTitle } from "./shell/RouteTitle";

// Lazy-loaded per route: keeps ConversationPage's markdown/syntax-
// highlighting dependencies (the bulk of the production bundle) out of the
// initial load for users who only ever see the dashboard or workspaces.
const LoginPage = lazy(() => import("./routes/LoginPage").then((m) => ({ default: m.LoginPage })));
const InboxPage = lazy(() => import("./routes/InboxPage").then((m) => ({ default: m.InboxPage })));
const TodayPage = lazy(() => import("./routes/TodayPage").then((m) => ({ default: m.TodayPage })));
const ConversationPage = lazy(() => import("./routes/ConversationPage").then((m) => ({ default: m.ConversationPage })));
const MachinesPage = lazy(() => import("./routes/MachinesPage").then((m) => ({ default: m.MachinesPage })));
const MachinePage = lazy(() => import("./routes/MachinePage").then((m) => ({ default: m.MachinePage })));
const MachineNewPage = lazy(() => import("./routes/MachineNewPage").then((m) => ({ default: m.MachineNewPage })));
const SettingsPage = lazy(() => import("./routes/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const NotFoundPage = lazy(() => import("./routes/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));
const VaultPage = lazy(() => import("./routes/VaultPage").then((m) => ({ default: m.VaultPage })));

function RouteFallback() {
  return <p className="p-4 text-ink-3">Loading…</p>;
}

// The Inbox's tab title carries the needs-you count ("Inbox (3) · Loomux").
function InboxTitle({ children }: { children: React.ReactNode }) {
  const count = useNeedsYouCount();
  return <RouteTitle title={count > 0 ? `Inbox (${count})` : "Inbox"}>{children}</RouteTitle>;
}

export function App() {
  const { pathname } = useLocation();
  return (
    <RouteErrorBoundary resetKey={pathname}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<RouteTitle title="Log in"><LoginPage /></RouteTitle>} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              {/* Route map: docs/design/redesign/build-plan.md §4. Screens not yet
                  rebuilt render their current page inside the new shell. */}
              <Route path="/" element={<InboxTitle><InboxPage /></InboxTitle>} />
              <Route path="/today" element={<TodayPage />} />
              <Route path="/today/:date" element={<TodayPage />} />
              <Route path="/conversations/:id" element={<ConversationPage />} />
              <Route path="/machines" element={<MachinesPage />} />
              <Route path="/machines/new" element={<MachineNewPage />} />
              <Route path="/machines/:id" element={<MachinePage />} />
              <Route path="/vault" element={<VaultPage />} />
              <Route path="/settings" element={<RouteTitle title="Settings"><SettingsPage /></RouteTitle>} />

              {/* Old addresses keep working. */}
              <Route path="/conversations" element={<KeepQueryRedirect to="/today" hash="#all" />} />
              <Route path="/targets" element={<KeepQueryRedirect to="/machines" />} />
              <Route path="/targets/:id" element={<KeepQueryRedirect to="/machines/:id" />} />
              <Route path="/workspaces" element={<KeepQueryRedirect to="/machines" />} />
              <Route path="/credentials" element={<KeepQueryRedirect to="/vault" />} />

              <Route path="*" element={<RouteTitle title="Not found"><NotFoundPage /></RouteTitle>} />
            </Route>
          </Route>
        </Routes>
      </Suspense>
    </RouteErrorBoundary>
  );
}

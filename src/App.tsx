import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { useNeedsYouCount } from "./lib/useNeedsYouCount";
import { AppShell } from "./shell/AppShell";
import { KeepQueryRedirect } from "./shell/KeepQueryRedirect";
import { RouteTitle } from "./shell/RouteTitle";

// Lazy-loaded per route: keeps ConversationDetailPage's markdown/syntax-
// highlighting dependencies (the bulk of the production bundle) out of the
// initial load for users who only ever see the dashboard or workspaces.
const LoginPage = lazy(() => import("./routes/LoginPage").then((m) => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import("./routes/DashboardPage").then((m) => ({ default: m.DashboardPage })));
const ConversationsPage = lazy(() =>
  import("./routes/ConversationsPage").then((m) => ({ default: m.ConversationsPage })),
);
const ConversationDetailPage = lazy(() =>
  import("./routes/ConversationDetailPage").then((m) => ({ default: m.ConversationDetailPage })),
);
const MachinesPage = lazy(() => import("./routes/MachinesPage").then((m) => ({ default: m.MachinesPage })));
const SettingsPage = lazy(() => import("./routes/SettingsPage").then((m) => ({ default: m.SettingsPage })));
const NotFoundPage = lazy(() => import("./routes/NotFoundPage").then((m) => ({ default: m.NotFoundPage })));
const CredentialsPage = lazy(() =>
  import("./routes/CredentialsPage").then((m) => ({ default: m.CredentialsPage })),
);

function RouteFallback() {
  return <p className="p-4 text-ink-3">Loading…</p>;
}

// The Inbox's tab title carries the needs-you count ("Inbox (3) · Loomux").
function InboxTitle({ children }: { children: React.ReactNode }) {
  const count = useNeedsYouCount();
  return <RouteTitle title={count > 0 ? `Inbox (${count})` : "Inbox"}>{children}</RouteTitle>;
}

export function App() {
  return (
    <RouteErrorBoundary>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<RouteTitle title="Log in"><LoginPage /></RouteTitle>} />
          <Route element={<ProtectedRoute />}>
            <Route element={<AppShell />}>
              {/* Route map: docs/design/redesign/build-plan.md §4. Screens not yet
                  rebuilt render their current page inside the new shell. */}
              <Route path="/" element={<InboxTitle><DashboardPage /></InboxTitle>} />
              <Route path="/today" element={<RouteTitle title="Today"><ConversationsPage /></RouteTitle>} />
              <Route path="/conversations/:id" element={<RouteTitle title="Conversation"><ConversationDetailPage /></RouteTitle>} />
              <Route path="/machines" element={<RouteTitle title="Machines"><MachinesPage /></RouteTitle>} />
              <Route path="/vault" element={<RouteTitle title="Vault"><CredentialsPage /></RouteTitle>} />
              <Route path="/settings" element={<RouteTitle title="Settings"><SettingsPage /></RouteTitle>} />

              {/* Old addresses keep working. */}
              <Route path="/conversations" element={<KeepQueryRedirect to="/today" />} />
              <Route path="/targets" element={<KeepQueryRedirect to="/machines" />} />
              <Route path="/targets/:id" element={<KeepQueryRedirect to="/machines" />} />
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

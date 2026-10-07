import { Navigate, useLocation, useParams } from "react-router-dom";

// A moved route (build-plan §4): /targets → /machines and so on. Keeps the
// query string and hash, and fills `:param`s in `to` from the old path, so
// bookmarks and old links land on the same thing.
export function KeepQueryRedirect({ to }: { to: string }) {
  const location = useLocation();
  const params = useParams();
  const path = to.replace(/:(\w+)/g, (_, name: string) => encodeURIComponent(params[name] ?? ""));
  return <Navigate to={path + location.search + location.hash} replace />;
}

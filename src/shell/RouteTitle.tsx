import { useDocumentTitle } from "../lib/useDocumentTitle";

export function RouteTitle({ title, children }: { title: string; children: React.ReactNode }) {
  useDocumentTitle(title);
  return <>{children}</>;
}

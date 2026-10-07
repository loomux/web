import { useEffect } from "react";

// Names the browser tab after the screen ("Inbox · Loomux"), so tabs,
// history and the installed app's task switcher say where you are.
export function useDocumentTitle(title: string) {
  useEffect(() => {
    document.title = title ? `${title} · Loomux` : "Loomux";
  }, [title]);
}

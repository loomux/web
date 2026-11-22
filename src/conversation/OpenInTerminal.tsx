import { useState } from "react";
import { CopyText } from "../ui/CopyText";

// The command that opens this conversation in the terminal client
// (loomux/server docs/design/tui-client-design.md "Handing work between
// clients": `loomux open <id>`), to copy into a shell. Shown on request,
// beside the tasks' own attach commands.
export function OpenInTerminal({ conversationId }: { conversationId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mb-2 flex flex-col gap-2 border-b border-line pb-3">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="min-h-9 self-start text-sm font-bold text-accent"
      >
        Open in the terminal
      </button>
      {open && (
        <>
          <CopyText text={`loomux open ${conversationId}`} label="Terminal command" />
          <p className="text-xs text-ink-3">Opens this conversation in the loomux terminal client.</p>
        </>
      )}
    </div>
  );
}

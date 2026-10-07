import { useRef, useState } from "react";

// A one-line command to copy. Where the Clipboard API is missing or refused
// (plain HTTP), Copy selects the text so a manual copy works.
export function CopyText({ text, label }: { text: string; label: string }) {
  const ref = useRef<HTMLElement>(null);
  const [copied, setCopied] = useState<"copied" | "selected" | null>(null);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied("copied");
    } catch {
      const el = ref.current;
      if (el) {
        const range = document.createRange();
        range.selectNodeContents(el);
        window.getSelection()?.removeAllRanges();
        window.getSelection()?.addRange(range);
      }
      setCopied("selected");
    }
    setTimeout(() => setCopied(null), 2500);
  }

  return (
    <div className="flex items-stretch overflow-hidden rounded-control bg-pane">
      <code
        ref={ref}
        aria-label={label}
        className="min-w-0 flex-1 overflow-x-auto px-3 py-2.5 font-mono text-sm whitespace-nowrap text-pane-ink"
      >
        {text}
      </code>
      <button
        type="button"
        onClick={() => void copy()}
        className="min-h-10 shrink-0 border-l border-pane-dim/40 px-3 text-sm font-bold text-pane-ink hover:text-pane-hi"
      >
        {copied === "copied" ? "Copied" : copied === "selected" ? "Selected" : "Copy"}
      </button>
    </div>
  );
}

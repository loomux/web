import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

// Agent replies are routinely code-heavy and were rendering as an
// unstyled text blob — see docs/design/web-client-phase2-design.md
// "/conversations/:id — the chat view itself". `role` only tweaks link
// color so it reads on both the dark user bubble and the light
// assistant bubble.
export function MessageContent({ role, text }: { role: "user" | "assistant"; text: string }) {
  const linkClass =
    role === "user"
      ? "underline underline-offset-2 hover:no-underline"
      : "text-blue-600 underline underline-offset-2 hover:no-underline dark:text-blue-400";

  const components: Components = {
    p: ({ children }) => <p className="whitespace-pre-wrap first:mt-0 last:mb-0 my-2">{children}</p>,
    ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
    ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
    li: ({ children }) => <li>{children}</li>,
    a: ({ children, href }) => (
      <a href={href} target="_blank" rel="noreferrer noopener" className={linkClass}>
        {children}
      </a>
    ),
    blockquote: ({ children }) => (
      <blockquote className="border-l-2 border-current/30 pl-3 my-2 opacity-80">{children}</blockquote>
    ),
    table: ({ children }) => (
      <div className="overflow-x-auto my-2">
        <table className="border-collapse text-sm">{children}</table>
      </div>
    ),
    th: ({ children }) => <th className="border border-current/20 px-2 py-1 text-left">{children}</th>,
    td: ({ children }) => <td className="border border-current/20 px-2 py-1">{children}</td>,
    code: ({ className, children, ...props }) => {
      // Fenced code blocks get a `language-*` class from rehype-highlight
      // and are already wrapped in a `<pre>` by react-markdown; anything
      // without that wrapper is inline code.
      const isBlock = /language-/.test(className ?? "");
      if (!isBlock) {
        return (
          <code className="rounded bg-black/10 px-1 py-0.5 text-[0.85em] dark:bg-white/10" {...props}>
            {children}
          </code>
        );
      }
      return (
        <code className={`${className ?? ""} text-[0.85em]`} {...props}>
          {children}
        </code>
      );
    },
    pre: ({ children }) => (
      <pre className="my-2 overflow-x-auto rounded bg-black/85 px-3 py-2 text-neutral-100 dark:bg-black/60">
        {children}
      </pre>
    ),
  };

  return (
    <div className="text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

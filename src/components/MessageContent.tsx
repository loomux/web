import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

type PluginList = NonNullable<Options["rehypePlugins"]>;

// highlight.js's C/C++/Arduino grammars share a known, unfixed ReDoS regex
// (highlightjs/highlight.js#4362) in their function-declaration matcher.
// Since this renders LLM-generated content, a crafted ```cpp fenced block
// could freeze the tab — so those languages (and every alias lowlight
// registers for them) are rendered unhighlighted instead of running the
// vulnerable tokenizer. See docs/design/web-client-phase2-design.md
// "/conversations/:id — the chat view itself".
const REDOS_AFFECTED_LANGUAGES = ["c", "h", "cpp", "cc", "c++", "h++", "hpp", "hh", "hxx", "cxx", "arduino", "ino"];

const remarkPlugins: PluginList = [remarkGfm];
const rehypePlugins: PluginList = [[rehypeHighlight, { plainText: REDOS_AFFECTED_LANGUAGES }]];

// Block code styling (padding, background, syntax-highlight token colors)
// lives in index.css via `pre code` / `:not(pre) > code` selectors, rather
// than branching in JS on the presence of a `language-*` class — a fenced
// block with no declared language (common for shell/log output) has no
// such class but must still be styled as a block, not inline code.
const components: Components = {
  p: ({ children }) => <p className="whitespace-pre-wrap first:mt-0 last:mb-0 my-2">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1">{children}</ol>,
  li: ({ children }) => <li>{children}</li>,
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-blue-600 underline underline-offset-2 hover:no-underline dark:text-blue-400"
    >
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
  // `node` is react-markdown's internal hast AST node — it must not be
  // forwarded to the DOM element (it stringifies to `[object Object]`).
  code: ({ node: _node, ...props }) => <code {...props} />,
  pre: ({ children }) => (
    <pre className="my-2 overflow-x-auto rounded bg-black/85 px-3 py-2 text-neutral-100 dark:bg-black/60">
      {children}
    </pre>
  ),
  // Markdown images render as `<img>` and fetch their `src` — an assistant
  // reply could embed one purely as a tracking pixel. There's no product
  // need for inline images in agent chat output, so they're dropped.
  img: () => null,
};

// Agent replies are routinely code-heavy and were rendering as an
// unstyled text blob — see docs/design/web-client-phase2-design.md
// "/conversations/:id — the chat view itself". User-typed text is
// rendered as plain text rather than parsed as Markdown/GFM: the design
// doc frames this as an assistant-reply feature, and parsing user input
// would let `_x_`/`# x`/bare URLs surprise-format or spoof UI.
export function MessageContent({ role, text }: { role: "user" | "assistant"; text: string }) {
  if (role === "user") {
    return <p className="whitespace-pre-wrap text-sm leading-relaxed">{text}</p>;
  }

  return (
    <div className="markdown-content text-sm leading-relaxed">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

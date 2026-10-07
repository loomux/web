import { useRef, useState } from "react";
import ReactMarkdown, { type Components, type Options } from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";

type PluginList = NonNullable<Options["rehypePlugins"]>;

// A minimal hast-shaped node — avoids importing `hast`'s types directly
// (a transitive dependency, not one of this project's own).
interface HastLikeNode {
  type: string;
  tagName?: string;
  properties?: { className?: unknown[] } & Record<string, unknown>;
  children?: HastLikeNode[];
}

// rehype-highlight extracts a fenced block's declared language straight off
// the `language-*`/`lang-*` class on the `<code>` element and compares it
// against `plainText` with an exact, case-sensitive `Array.includes` (its
// `language()` helper reads the class value as-is, before lowlight resolves
// any alias). That means the exclusion below only works for the exact
// casing listed — an uppercase ```C or ```CPP fence would bypass it and
// still run the vulnerable tokenizer. This plugin runs first and lowercases
// that class so the comparison rehype-highlight does is effectively
// case-insensitive.
function rehypeLowercaseCodeLanguage() {
  return function transformer(tree: HastLikeNode) {
    visit(tree);
  };

  function visit(node: HastLikeNode, parent?: HastLikeNode) {
    if (
      node.type === "element" &&
      node.tagName === "code" &&
      parent?.type === "element" &&
      parent.tagName === "pre" &&
      Array.isArray(node.properties?.className)
    ) {
      node.properties.className = node.properties.className.map((value) => {
        const str = String(value);
        return /^(language|lang)-/.test(str) ? str.toLowerCase() : str;
      });
    }
    for (const child of node.children ?? []) {
      visit(child, node);
    }
  }
}

// highlight.js's C/C++/Arduino grammars share a known, unfixed ReDoS regex
// (highlightjs/highlight.js#4362) in their function-declaration matcher.
// Since this renders LLM-generated content, a crafted fenced block (e.g.
// ```cpp) could freeze the tab — so every alias lowlight registers for
// these grammars is listed here (lowercase; rehypeLowercaseCodeLanguage
// above normalizes the fence tag's case before this list is checked) and
// rendered unhighlighted instead of running the vulnerable tokenizer. See
// docs/design/web-client-phase2-design.md "/conversations/:id — the chat
// view itself".
const REDOS_AFFECTED_LANGUAGES = ["c", "h", "cpp", "cc", "c++", "h++", "hpp", "hh", "hxx", "cxx", "arduino", "ino"];

const remarkPlugins: PluginList = [remarkGfm];
const rehypePlugins: PluginList = [
  rehypeLowercaseCodeLanguage,
  [rehypeHighlight, { plainText: REDOS_AFFECTED_LANGUAGES }],
];

// Block code styling (padding, background, syntax-highlight token colors)
// lives in index.css via `pre code` / `:not(pre) > code` selectors, rather
// than branching in JS on the presence of a `language-*` class — a fenced
// block with no declared language (common for shell/log output) has no
// such class but must still be styled as a block, not inline code.
// A fenced block on the dark pane, with a Copy button. Copying reads the
// rendered text, so it's exactly what's shown; where the Clipboard API is
// missing (plain HTTP) it selects the text for a manual copy instead.
function CodeBlock({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLPreElement>(null);
  const [copied, setCopied] = useState(false);
  async function copy() {
    const pre = ref.current;
    if (!pre) return;
    try {
      await navigator.clipboard.writeText(pre.innerText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const range = document.createRange();
      range.selectNodeContents(pre);
      window.getSelection()?.removeAllRanges();
      window.getSelection()?.addRange(range);
    }
  }
  return (
    <div className="group relative my-2">
      <pre ref={ref} className="overflow-x-auto rounded-control bg-pane px-3.5 py-3 pr-16 font-mono text-sm text-pane-ink">
        {children}
      </pre>
      <button
        type="button"
        onClick={() => void copy()}
        className="absolute top-1.5 right-1.5 min-h-8 rounded-md px-2 text-xs font-bold text-pane-dim hover:text-pane-ink focus-visible:text-pane-ink"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

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
      className="font-bold text-accent underline underline-offset-2 hover:no-underline"
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
  pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
  h1: ({ children }) => <h3 className="mt-4 mb-2 text-lg font-extrabold first:mt-0">{children}</h3>,
  h2: ({ children }) => <h3 className="mt-4 mb-2 text-lg font-extrabold first:mt-0">{children}</h3>,
  h3: ({ children }) => <h4 className="mt-3 mb-1.5 font-extrabold first:mt-0">{children}</h4>,
  h4: ({ children }) => <h4 className="mt-3 mb-1.5 font-bold first:mt-0">{children}</h4>,
  h5: ({ children }) => <h4 className="mt-3 mb-1.5 font-bold first:mt-0">{children}</h4>,
  h6: ({ children }) => <h4 className="mt-3 mb-1.5 font-bold first:mt-0">{children}</h4>,
  hr: () => <hr className="my-3 border-line" />,
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
    return <p className="whitespace-pre-wrap leading-relaxed">{text}</p>;
  }

  return (
    <div className="markdown-content leading-relaxed">
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}

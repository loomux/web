import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageContent } from "./MessageContent";

describe("MessageContent", () => {
  it("renders assistant text as Markdown, including a fenced code block distinct from prose", () => {
    const { container } = render(
      <MessageContent role="assistant" text={"Some *emphasis* and:\n\n```js\nconst x = 1;\n```"} />,
    );

    expect(screen.getByText("emphasis").tagName).toBe("EM");
    const code = container.querySelector("pre code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toContain("const x = 1;");
  });

  it("renders a fenced code block with no declared language as a block, not inline code", () => {
    const { container } = render(<MessageContent role="assistant" text={"```\nplain output\n```"} />);

    const code = container.querySelector("pre code");
    expect(code).not.toBeNull();
    expect(code?.textContent).toContain("plain output");
  });

  it("does not leak react-markdown's internal `node` prop onto the DOM <code> element", () => {
    const { container } = render(
      <MessageContent role="assistant" text={"inline `x` and:\n\n```js\nconst x = 1;\n```"} />,
    );

    for (const code of container.querySelectorAll("code")) {
      expect(code.getAttribute("node")).toBeNull();
    }
  });

  it("does not run the ReDoS-affected C/C++/Arduino highlighter grammars", () => {
    const { container } = render(<MessageContent role="assistant" text={"```cpp\nint a a a a a;\n```"} />);

    const code = container.querySelector("pre code");
    expect(code).not.toBeNull();
    // No tokenization happened: no hljs base class, no per-token spans.
    expect(code?.className).not.toMatch(/\bhljs\b/);
    expect(code?.querySelectorAll("span")).toHaveLength(0);
    expect(code?.textContent).toContain("int a a a a a;");
  });

  it("does not run the ReDoS-affected grammars regardless of the fence tag's letter case", () => {
    const { container } = render(<MessageContent role="assistant" text={"```CPP\nint a a a a a;\n```"} />);

    const code = container.querySelector("pre code");
    expect(code).not.toBeNull();
    expect(code?.className).not.toMatch(/\bhljs\b/);
    expect(code?.querySelectorAll("span")).toHaveLength(0);
  });

  it("escapes raw HTML from message content instead of rendering it as an element", () => {
    const { container } = render(<MessageContent role="assistant" text={"<script>alert(1)</script>"} />);

    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("alert(1)");
  });

  it("strips javascript: URLs from links", () => {
    const { container } = render(<MessageContent role="assistant" text={"[click me](javascript:alert(1))"} />);

    // An empty/stripped href means the element isn't exposed with an
    // accessible "link" role, so query it directly rather than by role.
    const link = container.querySelector("a");
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("");
  });

  it("drops markdown images instead of rendering an <img> that fetches an external URL", () => {
    const { container } = render(
      <MessageContent role="assistant" text={"![x](https://attacker.example.com/track.png)"} />,
    );

    expect(container.querySelector("img")).toBeNull();
  });

  it("renders user messages as plain text, not Markdown", () => {
    const { container } = render(<MessageContent role="user" text={"_hello_ # not a heading\nsecond line"} />);

    expect(container.querySelector("em, h1, h2, h3")).toBeNull();
    expect(screen.getByText(/_hello_ # not a heading/)).toBeInTheDocument();
  });
});

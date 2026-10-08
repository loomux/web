/// <reference types="node" />
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

// Colours come from the design tokens (styles/tokens.css, build-plan §2),
// so the two themes can't drift apart screen by screen. This fails on a
// colour literal (hex, rgb(), hsl()) or a Tailwind palette class
// (bg-neutral-100, text-white, …) anywhere else in src/.
const scripts = import.meta.glob(
  ["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts", "!../**/*.test.tsx", "!../test/**"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

// Vitest serves CSS imports (?raw included) as empty strings, so styles are
// read from disk, keyed the same way ("./tokens.css", "../index.css").
const here = join(process.cwd(), "src/styles");
const styles = Object.fromEntries(
  readdirSync(join(process.cwd(), "src"), { recursive: true, encoding: "utf8" })
    .filter((f: string) => f.endsWith(".css"))
    .map((f: string) => {
      const abs = join(process.cwd(), "src", f);
      const rel = relative(here, abs);
      return [rel.startsWith(".") ? rel : `./${rel}`, readFileSync(abs, "utf8")];
    }),
);

const sources: Record<string, string> = { ...scripts, ...styles };

// Where colour values are defined.
const definitions = new Set([
  "./tokens.css",
  // Syntax highlighting, against the always-dark code pane.
  "./code.css",
  // The browser chrome colours, which must be known before CSS loads.
  "../lib/theme.ts",
]);

const PALETTE =
  "white|black|(?:neutral|gray|slate|zinc|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\\d{2,3}";
const UTILITY =
  "bg|text|border(?:-[trblxy])?|ring|outline|fill|stroke|from|via|to|divide|placeholder|decoration|shadow|caret|accent";
const LITERAL = new RegExp(`#[0-9a-fA-F]{3,8}\\b|\\b(?:rgba?|hsla?)\\(|\\b(?:${UTILITY})-(?:${PALETTE})\\b`);

// Comments may name a ticket ("#142"); only code counts.
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("token boundary", () => {
  it("found the sources to check", () => {
    expect(Object.keys(scripts).length).toBeGreaterThan(20);
    expect(styles["./tokens.css"]).toContain("--ground");
    expect(styles["../index.css"]).toContain("@theme");
  });

  for (const [file, text] of Object.entries(sources)) {
    if (definitions.has(file)) continue;
    it(`${file} takes its colours from the tokens`, () => {
      expect(code(text)).not.toMatch(LITERAL);
    });
  }
});

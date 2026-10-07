import { describe, expect, it } from "vitest";

// Colours come from the design tokens (styles/tokens.css, build-plan §2),
// so the two themes can't drift apart screen by screen. This fails on a
// colour literal (hex, rgb(), hsl()) or a Tailwind palette class
// (bg-neutral-100, text-white, …) anywhere else in src/.
const sources = import.meta.glob(
  ["../**/*.ts", "../**/*.tsx", "../**/*.css", "!../**/*.test.ts", "!../**/*.test.tsx", "!../test/**"],
  { query: "?raw", import: "default", eager: true },
) as Record<string, string>;

// Where colour values are defined.
const definitions = new Set([
  "./tokens.css",
  // Syntax highlighting, against the always-dark code pane.
  "./code.css",
  // The browser chrome colours, which must be known before CSS loads.
  "../lib/theme.ts",
]);

// Screens the redesign hasn't rebuilt yet (build-plan §6). Each PR that
// replaces one removes it here; the list only shrinks.
const legacy = new Set([
  "../components/AttachInfo.tsx",
  "../components/AttentionCard.tsx",
  "../components/ConfirmationCard.tsx",
  "../components/DispatchCards.tsx",
  "../components/MessageContent.tsx",
  "../components/RouteErrorBoundary.tsx",
  "../components/VersionBanner.tsx",
  "../components/WebClientUpdate.tsx",
  "../lib/conversations.ts",
  "../lib/targets.ts",
  "../routes/ConversationDetailPage.tsx",
  "../routes/ConversationsPage.tsx",
  "../routes/CredentialsPage.tsx",
  "../routes/DashboardPage.tsx",
  "../routes/LoginPage.tsx",
  "../routes/TargetsPage.tsx",
  "../routes/WorkspacesPage.tsx",
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
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  it("lists only legacy files that exist and still need converting", () => {
    for (const file of legacy) {
      expect(Object.keys(sources)).toContain(file);
      expect(code(sources[file]), `${file} is clean: remove it from the legacy list`).toMatch(LITERAL);
    }
  });

  for (const [file, text] of Object.entries(sources)) {
    if (definitions.has(file) || legacy.has(file)) continue;
    it(`${file} takes its colours from the tokens`, () => {
      expect(code(text)).not.toMatch(LITERAL);
    });
  }
});

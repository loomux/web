import { describe, expect, it } from "vitest";

// Screens and hooks reach the server only through the typed client
// (lib/api.ts: `api` and openConversationStream), so a redesign can swap
// any screen without touching how Loomux is called. This fails on a direct
// fetch, an EventSource, or an /api/v1 path anywhere else in src/.
const sources = import.meta.glob(["../**/*.ts", "../**/*.tsx", "!../**/*.test.ts", "!../**/*.test.tsx", "!../test/**"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// The client itself, and the service worker registration (no API calls,
// but it's the one other place that names server paths).
const allowed = new Set(["./api.ts", "./serviceWorker.ts"]);

// Comments may say "fetch (…)"; only code counts.
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("API boundary", () => {
  it("found the sources to check", () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  for (const [file, text] of Object.entries(sources)) {
    if (allowed.has(file)) continue;
    it(`${file} doesn't call the server directly`, () => {
      expect(code(text)).not.toMatch(/\bfetch\s*\(|fetchEventSource|new EventSource|\/api\/v1/);
    });
  }
});

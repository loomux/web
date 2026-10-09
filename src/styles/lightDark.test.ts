import { readFileSync } from "node:fs";
import { join } from "node:path";
import { transform } from "lightningcss";
import { describe, expect, it } from "vitest";
import config from "../../vite.config";

// LOOM-175: tokens.css writes every colour as light-dark(), which older
// browsers don't know. The build's CSS target lowers it into a fallback
// that works without it; this holds the target to that.

// "chrome111" → lightningcss's { chrome: 111 << 16 }.
function targets(list: string[]) {
  const out: Record<string, number> = {};
  for (const t of list) {
    const m = /^([a-z]+)(\d+)(?:\.(\d+))?$/.exec(t);
    if (!m) throw new Error(`unexpected cssTarget ${t}`);
    const name = m[1] === "ios" ? "ios_saf" : m[1];
    out[name] = (Number(m[2]) << 16) | (Number(m[3] ?? 0) << 8);
  }
  return out;
}

describe("light-dark() fallback", () => {
  const cssTarget = config.build?.cssTarget;

  it("builds for browsers without light-dark()", () => {
    expect(Array.isArray(cssTarget)).toBe(true);
    const t = targets(cssTarget as string[]);
    // light-dark() arrived in Chrome 123, Firefox 120 and Safari 17.5.
    expect(t.chrome).toBeLessThan(123 << 16);
    expect(t.firefox).toBeLessThan(120 << 16);
    expect(t.safari).toBeLessThan((17 << 16) | (5 << 8));
  });

  it("leaves no bare light-dark() in the tokens once built, and themes still switch", () => {
    const code = readFileSync(join(process.cwd(), "src/styles/tokens.css"));
    const out = transform({ filename: "tokens.css", code, targets: targets(cssTarget as string[]) }).code.toString();
    expect(out).not.toContain("light-dark(");
    expect(out).toMatch(/--surface:\s*var\(--lightningcss-light,\s*#fff\)\s*var\(--lightningcss-dark,\s*#132036\)/);
    expect(out).toMatch(/\[data-theme="?dark"?\]\s*\{[^}]*--lightningcss-dark:\s*initial/);
    expect(out).toMatch(/\[data-theme="?light"?\]\s*\{[^}]*--lightningcss-light:\s*initial/);
  });
});

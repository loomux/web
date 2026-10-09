/// <reference types="node" />
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Text fields, selects and textareas need a border with 3:1 contrast
// against what they sit on (WCAG 1.4.11), in both themes. --line is for
// dividers and is too faint for that; controls use --line-strong.
const tokens = readFileSync(join(process.cwd(), "src/styles/tokens.css"), "utf8");

function token(name: string): [string, string] {
  const m = tokens.match(new RegExp(`--${name}:\\s*light-dark\\((#[0-9a-f]{6}),\\s*(#[0-9a-f]{6})\\)`, "i"));
  if (!m) throw new Error(`no light-dark() value for --${name}`);
  return [m[1], m[2]];
}

function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const scripts = import.meta.glob(["../**/*.tsx", "!../**/*.test.tsx", "!../test/**"], {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

// The class list of each <input>, <select> and <textarea>, following a
// className={NAME} to its const in the same file.
function controlClasses() {
  const found: { where: string; classes: string }[] = [];
  for (const [file, text] of Object.entries(scripts)) {
    for (const m of text.matchAll(/<(input|select|textarea)\b/g)) {
      const cls = text.slice(m.index).match(/className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([A-Z_]+)\})/);
      if (!cls) continue;
      const named = cls[3] && text.match(new RegExp(`const ${cls[3]} = "([^"]*)"`))?.[1];
      const tpl = cls[2]?.replace(/\$\{([A-Z_]+)\}/g, (_, n: string) => text.match(new RegExp(`const ${n} = "([^"]*)"`))?.[1] ?? "");
      found.push({ where: `${file} <${m[1]}>`, classes: cls[1] ?? tpl ?? named ?? "" });
    }
  }
  return found;
}

describe("form control borders", () => {
  it("--line-strong has 3:1 against every surface, in both themes", () => {
    const [light, dark] = token("line-strong");
    for (const surface of ["ground", "surface", "surface-2", "sunken"]) {
      const [l, d] = token(surface);
      expect(contrast(light, l), `light on --${surface}`).toBeGreaterThanOrEqual(3);
      expect(contrast(dark, d), `dark on --${surface}`).toBeGreaterThanOrEqual(3);
    }
  });

  it("every text field, select and textarea uses it", () => {
    const controls = controlClasses();
    expect(controls.length).toBeGreaterThan(10);
    for (const { where, classes } of controls) {
      expect(classes.split(/\s+/), where).toContain("border-line-strong");
    }
  });
});

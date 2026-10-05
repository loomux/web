import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// scripts/changelog.sh: changelog fragments, one file per PR, folded into
// CHANGELOG.md at a milestone.
const script = resolve("scripts/changelog.sh");

function setup(fragments: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), "cl-"));
  mkdirSync(join(dir, "changes"));
  for (const [name, body] of Object.entries(fragments)) writeFileSync(join(dir, "changes", name), body);
  writeFileSync(
    join(dir, "CHANGELOG.md"),
    "# Changelog\n\n## [Unreleased]\n\nWhat's coming waits in changes/.\n\n## [0.1.0] - 2026-10-05\n\n- first\n\n" +
      "[Unreleased]: https://github.com/loomux/web/compare/v0.1.0...HEAD\n[0.1.0]: https://github.com/loomux/web/releases/tag/v0.1.0\n",
  );
  const run = (...args: string[]) => {
    const r = spawnSync("sh", [script, ...args], { cwd: dir, encoding: "utf8" });
    return { ok: r.status === 0, out: (r.stdout ?? "").trim(), err: r.stderr ?? "" };
  };
  return { dir, run };
}

describe("changelog.sh", () => {
  it("checks fragments", () => {
    expect(setup({ "a.md": "### Added\n\n- x\n" }).run("check").ok).toBe(true);
    const bad = setup({ "a.md": "- no heading\n", "b.md": "### Nope\n\n- x\n", "c.md": "### Fixed\n" });
    const r = bad.run("check");
    expect(r.ok).toBe(false);
    expect(r.err).toMatch(/a\.md: text before/);
    expect(r.err).toMatch(/b\.md: unknown section/);
    expect(r.err).toMatch(/c\.md: no "- " entries/);
  });

  it("assembles sections in Keep a Changelog order across files", () => {
    const { run } = setup({
      "a.md": "### Fixed\n\n- fix a\n\n### Added\n\n- add a\n",
      "b.md": "### Added\n\n- add b\n  wrapped\n",
    });
    expect(run("assemble").out).toBe("### Added\n\n- add a\n- add b\n  wrapped\n\n### Fixed\n\n- fix a");
  });

  it("releases them into CHANGELOG.md and deletes them", () => {
    const { dir, run } = setup({ "a.md": "### Added\n\n- a \\`quoted\\` thing\n", "README.md": "# how\n" });
    expect(run("release", "0.2.0", "2026-10-20").ok).toBe(true);
    const out = readFileSync(join(dir, "CHANGELOG.md"), "utf8");
    expect(out).toContain(
      "## [Unreleased]\n\nWhat's coming waits in changes/.\n\n## [0.2.0] - 2026-10-20\n\n### Added\n\n- a \\`quoted\\` thing\n\n## [0.1.0]",
    );
    expect(out).toContain(
      "[Unreleased]: https://github.com/loomux/web/compare/v0.2.0...HEAD\n[0.2.0]: https://github.com/loomux/web/releases/tag/v0.2.0\n",
    );
    expect(readdirSync(join(dir, "changes"))).toEqual(["README.md"]);
    expect(run("release", "0.2.0", "2026-10-20").ok).toBe(false);
    expect(run("release", "v0.3.0", "2026-10-20").ok).toBe(false);
  });
});

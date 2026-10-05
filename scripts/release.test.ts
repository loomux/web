import { describe, expect, it } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// scripts/release.sh decides what a version tag publishes (LOOM-129).
function release(...args: string[]) {
  const r = spawnSync("sh", ["scripts/release.sh", ...args], { encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim() };
}

describe("release.sh", () => {
  it("reads SemVer tags and refuses anything else", () => {
    expect(release("version", "v0.1.0")).toEqual({ ok: true, out: "0.1.0" });
    expect(release("version", "v1.0.0-rc.1")).toEqual({ ok: true, out: "1.0.0-rc.1" });
    for (const bad of ["0.1.0", "v1.0", "v01.0.0", "v1.0.0+b", "v1.0.0-01"]) {
      expect(release("version", bad).ok).toBe(false);
    }
  });

  it("calls 0.y.z and -pre versions pre-releases", () => {
    expect(release("prerelease", "0.1.0").ok).toBe(true);
    expect(release("prerelease", "1.0.0-rc.1").ok).toBe(true);
    expect(release("prerelease", "1.0.0").ok).toBe(false);
  });

  it("computes the next patch or minor version", () => {
    expect(release("next", "patch", "0.1.9")).toEqual({ ok: true, out: "0.1.10" });
    expect(release("next", "minor", "0.1.9")).toEqual({ ok: true, out: "0.2.0" });
    expect(release("next", "patch", "1.0.0-rc.1").ok).toBe(false);
  });

  it("takes a version's notes from its CHANGELOG section only", () => {
    const file = join(mkdtempSync(join(tmpdir(), "rel-")), "CHANGELOG.md");
    writeFileSync(file, "# C\n\n## [Unreleased]\n\n## [0.1.0] - 2026-10-05\n\n- first\n\n[0.1.0]: https://x\n");
    expect(release("notes", "0.1.0", file)).toEqual({ ok: true, out: "- first" });
    expect(release("notes", "0.2.0", file).ok).toBe(false);
  });
});

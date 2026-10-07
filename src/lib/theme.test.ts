/// <reference types="node" />
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  applyThemePreference,
  DARK_CHROME,
  LIGHT_CHROME,
  readThemePreference,
  storeThemePreference,
  THEME_STORAGE_KEY,
} from "./theme";

function addMeta(media: string) {
  const m = document.createElement("meta");
  m.name = "theme-color";
  m.media = media;
  m.content = "";
  document.head.appendChild(m);
  return m;
}

describe("theme preference", () => {
  let light: HTMLMetaElement;
  let dark: HTMLMetaElement;

  beforeEach(() => {
    light = addMeta("(prefers-color-scheme: light)");
    dark = addMeta("(prefers-color-scheme: dark)");
  });

  afterEach(() => {
    light.remove();
    dark.remove();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  it("defaults to following the OS", () => {
    expect(readThemePreference()).toBe("system");
  });

  it("stores an explicit choice and forgets it for system", () => {
    storeThemePreference("dark");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(readThemePreference()).toBe("dark");
    storeThemePreference("system");
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBeNull();
  });

  it("ignores a stored value it doesn't know", () => {
    localStorage.setItem(THEME_STORAGE_KEY, "sepia");
    expect(readThemePreference()).toBe("system");
  });

  it("sets data-theme and both chrome colours for an explicit choice", () => {
    applyThemePreference("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(light.content).toBe(dark.content);
    expect(dark.content).toBe("#0c1426");
  });

  it("clears data-theme and splits the chrome colours for system", () => {
    applyThemePreference("light");
    applyThemePreference("system");
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(light.content).toBe("#e9eef3");
    expect(dark.content).toBe("#0c1426");
  });
});

// Read from disk: Vitest serves CSS imports as empty strings.
const tokensCss = readFileSync("src/styles/tokens.css", "utf8");
const indexHtml = readFileSync("index.html", "utf8");

describe("chrome colours", () => {
  it("match the --chrome token", () => {
    expect(tokensCss).toContain(`--chrome: light-dark(${LIGHT_CHROME}, ${DARK_CHROME});`);
  });

  it("match index.html's metas and pre-paint script", () => {
    expect(indexHtml).toContain(`media="(prefers-color-scheme: light)" content="${LIGHT_CHROME}"`);
    expect(indexHtml).toContain(`media="(prefers-color-scheme: dark)" content="${DARK_CHROME}"`);
    expect(indexHtml).toContain(`t === "dark" ? "${DARK_CHROME}" : "${LIGHT_CHROME}"`);
  });
});

import { useCallback, useEffect, useState } from "react";

// The colour theme: follow the OS, or the user's explicit choice
// (Settings). The choice lives in localStorage and is applied as
// data-theme on <html>, which styles/tokens.css keys the dark palette on.
// index.html applies a stored choice before first paint with the same
// key, so a dark-mode user never sees a light flash.
export type ThemePreference = "system" | "light" | "dark";

export const THEME_STORAGE_KEY = "loomux.theme";

// --chrome in styles/tokens.css, and the pre-paint script in index.html;
// theme.test.ts keeps the three in step.
export const LIGHT_CHROME = "#e9eef3";
export const DARK_CHROME = "#0c1426";

export function readThemePreference(): ThemePreference {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === "light" || v === "dark") return v;
  } catch {
    // storage blocked (private mode): follow the OS
  }
  return "system";
}

function systemPrefersDark(): boolean {
  return typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// The browser chrome colour (status bar of the installed app) follows the
// effective theme. index.html carries one meta per OS scheme; an explicit
// choice sets both to the chosen theme's value.
function applyChromeColour(pref: ThemePreference) {
  const metas = document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]');
  metas.forEach((m) => {
    if (pref === "system") {
      m.content = m.media.includes("dark") ? DARK_CHROME : LIGHT_CHROME;
    } else {
      m.content = pref === "dark" ? DARK_CHROME : LIGHT_CHROME;
    }
  });
}

export function applyThemePreference(pref: ThemePreference) {
  const root = document.documentElement;
  if (pref === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", pref);
  applyChromeColour(pref);
}

export function storeThemePreference(pref: ThemePreference) {
  try {
    if (pref === "system") localStorage.removeItem(THEME_STORAGE_KEY);
    else localStorage.setItem(THEME_STORAGE_KEY, pref);
  } catch {
    // not persisted; still applied for this visit
  }
}

export function effectiveTheme(pref: ThemePreference): "light" | "dark" {
  if (pref === "system") return systemPrefersDark() ? "dark" : "light";
  return pref;
}

export function useThemePreference() {
  const [pref, setPref] = useState<ThemePreference>(readThemePreference);

  const choose = useCallback((next: ThemePreference) => {
    storeThemePreference(next);
    applyThemePreference(next);
    setPref(next);
  }, []);

  useEffect(() => {
    applyThemePreference(pref);
  }, [pref]);

  return [pref, choose] as const;
}

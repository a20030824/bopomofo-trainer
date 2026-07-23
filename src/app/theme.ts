import type { StorageLike } from "./local-progress.js";

export const LOCAL_THEME_KEY = "bopomofo-trainer.theme.v1";

export type Theme = "light" | "dark";

export const DEFAULT_THEME: Theme = "light";

export function parseTheme(source: string): Theme | null {
  return source === "light" || source === "dark" ? source : null;
}

export function loadTheme(storage: StorageLike): Theme {
  const source = storage.getItem(LOCAL_THEME_KEY);
  return source === null ? DEFAULT_THEME : parseTheme(source) ?? DEFAULT_THEME;
}

export function saveTheme(storage: StorageLike, theme: Theme): void {
  storage.setItem(LOCAL_THEME_KEY, theme);
}

export function applyTheme(theme: Theme): void {
  if (theme === "dark") {
    document.documentElement.dataset.theme = "dark";
  } else {
    delete document.documentElement.dataset.theme;
  }
}

import { useEffect, useState } from "react";

export type RineTheme = "classic" | "line";

const THEME_KEY = "rine_ui_theme";

export function getRineTheme(): RineTheme {
  if (typeof window === "undefined") return "classic";
  const stored = window.localStorage.getItem(THEME_KEY);
  return stored === "line" ? "line" : "classic";
}

export function setRineTheme(theme: RineTheme): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(THEME_KEY, theme);
  window.dispatchEvent(new CustomEvent("rine_theme_changed", { detail: theme }));
}

export function useRineTheme(): [RineTheme, (theme: RineTheme) => void] {
  const [theme, setThemeState] = useState<RineTheme>(getRineTheme);

  useEffect(() => {
    const handleStorage = () => setThemeState(getRineTheme());
    window.addEventListener("storage", handleStorage);
    window.addEventListener("rine_theme_changed", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
      window.removeEventListener("rine_theme_changed", handleStorage);
    };
  }, []);

  const changeTheme = (next: RineTheme) => {
    setRineTheme(next);
    setThemeState(next);
  };

  return [theme, changeTheme];
}

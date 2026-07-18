import { useLayoutEffect, useState } from "react";

export type Theme = "light" | "dark";

const storageKey = "treasury-curve-research-theme";
const themeColors: Record<Theme, string> = {
  light: "#f3f5f3",
  dark: "#0e1110"
};

const getInitialTheme = (): Theme => {
  const stored = window.localStorage.getItem(storageKey);
  if (stored === "light" || stored === "dark") return stored;

  return "light";
};

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);

  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute("content", themeColors[theme]);
    window.localStorage.setItem(storageKey, theme);
  }, [theme]);

  const toggleTheme = () => setTheme((current) => (current === "light" ? "dark" : "light"));

  return { theme, toggleTheme };
}

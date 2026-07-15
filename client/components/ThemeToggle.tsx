"use client";

import { useTheme } from "@/lib/theme";

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={toggleTheme}
      aria-label={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      className="theme-toggle"
      title={theme === "light" ? "Dark mode" : "Light mode"}
    >
      {theme === "light" ? "☾" : "☀"}
    </button>
  );
}

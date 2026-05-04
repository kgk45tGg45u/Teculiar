"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { hydrateThemePreference, useThemeStore } from "../../store/use-theme-store";
import styles from "./theme-toggle.module.css";

export function ThemeToggle() {
  const { theme, toggleTheme } = useThemeStore();

  useEffect(() => {
    hydrateThemePreference();
  }, []);

  const isDark = theme === "dark";

  return (
    <button
      aria-label={isDark ? "Helles Design" : "Dunkles Design"}
      className={styles.toggle}
      title={isDark ? "Helles Design" : "Dunkles Design"}
      type="button"
      onClick={toggleTheme}
    >
      {isDark ? <Sun aria-hidden size={18} /> : <Moon aria-hidden size={18} />}
    </button>
  );
}

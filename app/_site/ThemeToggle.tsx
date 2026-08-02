"use client";

import { useEffect, useState } from "react";
import styles from "./site-shell.module.css";

type ThemePreference = "system" | "light" | "dark";

const STORAGE_KEY = "mimicry-theme";
const labels: Record<ThemePreference, string> = {
  system: "Система",
  light: "Светлая",
  dark: "Тёмная",
};

function resolveTheme(preference: ThemePreference) {
  if (preference !== "system") return preference;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyTheme(preference: ThemePreference) {
  const theme = resolveTheme(preference);
  document.documentElement.dataset.theme = theme;
  document.documentElement.dataset.themePreference = preference;
  document.documentElement.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [preference, setPreference] = useState<ThemePreference>("system");

  useEffect(() => {
    const saved = document.documentElement.dataset.themePreference;
    const next: ThemePreference =
      saved === "light" || saved === "dark" || saved === "system"
        ? saved
        : "system";
    applyTheme(next);
    const frame = window.requestAnimationFrame(() => setPreference(next));

    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const updateSystemTheme = () => {
      if (document.documentElement.dataset.themePreference === "system") {
        applyTheme("system");
      }
    };
    media.addEventListener("change", updateSystemTheme);
    return () => {
      window.cancelAnimationFrame(frame);
      media.removeEventListener("change", updateSystemTheme);
    };
  }, []);

  const cycleTheme = () => {
    const next: ThemePreference =
      preference === "system"
        ? "light"
        : preference === "light"
          ? "dark"
          : "system";
    localStorage.setItem(STORAGE_KEY, next);
    setPreference(next);
    applyTheme(next);
  };

  return (
    <button
      aria-label={`Тема: ${labels[preference]}. Переключить режим`}
      className={styles.themeToggle}
      onClick={cycleTheme}
      type="button"
    >
      <span className={styles.themeGlyph} aria-hidden="true" />
      <span>{labels[preference]}</span>
    </button>
  );
}

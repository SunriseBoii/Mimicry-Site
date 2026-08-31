"use client";

import { HEADER_LINKS, HERO_ANCHORS, type HeaderGroup, type ScreenNodeId } from "../topology";
import styles from "../ps04m5.module.css";

export function PersistentHeader({
  activeGroup,
  onNavigate,
  theme,
  onTheme,
  preview,
}: {
  activeGroup: HeaderGroup | null;
  onNavigate: (id: ScreenNodeId) => void;
  theme: "light" | "dark";
  onTheme: (theme: "light" | "dark") => void;
  preview?: boolean;
}) {
  return (
    <header className={styles.header} data-qa="m4-header">
      <a className={styles.wordmark} href="#screen-01" onClick={(event) => { event.preventDefault(); onNavigate("01"); }}>
        Mimicry group
      </a>
      <nav className={styles.nav} aria-label="Разделы прототипа">
        {HEADER_LINKS.map((item) => (
          <button
            key={item.group}
            type="button"
            data-active={activeGroup === item.group}
            aria-current={activeGroup === item.group ? "true" : undefined}
            onClick={() => onNavigate(item.target)}
          >
            {item.label}
          </button>
        ))}
        {preview ? null : (
          <button type="button" className={styles.themeToggle} onClick={() => onTheme(theme === "light" ? "dark" : "light")}>
            {theme === "light" ? "Dark" : "Light"}
          </button>
        )}
      </nav>
    </header>
  );
}

export { HERO_ANCHORS };

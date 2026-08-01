import type { ReactNode } from "react";
import { DesignSystemTheme } from "../_design-system/theme/Theme";
import { SiteFooter } from "./SiteFooter";
import { SiteHeader } from "./SiteHeader";
import styles from "./site-shell.module.css";

export function SiteShell({ children }: { children: ReactNode }) {
  return (
    <DesignSystemTheme className={styles.siteShell}>
      <a className={styles.skipLink} href="#main-content">
        К основному содержимому
      </a>
      <SiteHeader />
      <main className={styles.main} id="main-content" tabIndex={-1}>
        {children}
      </main>
      <SiteFooter />
    </DesignSystemTheme>
  );
}

import Link from "next/link";
import { Container } from "../_design-system/components";
import { SiteNavigation } from "./SiteNavigation";
import styles from "./site-shell.module.css";

export function SiteHeader() {
  return (
    <header className={styles.header}>
      <Container className={styles.headerInner}>
        <Link
          aria-label="Mimicry group — главная"
          className={styles.brand}
          href="/"
        >
          Mimicry group
        </Link>
        <SiteNavigation />
      </Container>
    </header>
  );
}

import type { ReactNode } from "react";
import styles from "../_styles/visual-lab.module.css";

export function FragmentFrame({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className={styles.fragmentFrame} role="region" aria-label={title}>
      <div className={styles.fragmentLabel}>
        <span>{index}</span>
        <span>{title}</span>
      </div>
      <div className={styles.fragmentBody}>{children}</div>
    </div>
  );
}

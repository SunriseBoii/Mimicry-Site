import type { CompetenceId } from "./color-system";
import styles from "./color-components.module.css";

export function CompetenceMotif({
  competence,
  label,
}: {
  competence: CompetenceId;
  label?: string;
}) {
  return (
    <span
      aria-hidden={label ? undefined : true}
      aria-label={label}
      className={styles.motif}
      data-competence={competence}
      role={label ? "img" : undefined}
    >
      <i />
      <i />
      <i />
      <i />
      <i />
    </span>
  );
}

import type { ViewportId } from "../_data/variants";
import { viewports } from "../_data/variants";
import styles from "../_styles/visual-lab.module.css";

type ViewportSwitcherProps = {
  value: ViewportId;
  onChange: (value: ViewportId) => void;
};

export function ViewportSwitcher({ value, onChange }: ViewportSwitcherProps) {
  return (
    <div className={styles.controlGroup}>
      <p className={styles.controlLabel}>Ширина preview</p>
      <div className={styles.segmentedControl} role="group" aria-label="Ширина preview">
        {viewports.map((viewport) => {
          const selected = viewport.id === value;

          return (
            <button
              className={styles.segmentButton}
              data-selected={selected ? "true" : "false"}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(viewport.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onChange(viewport.id);
                }
              }}
              key={viewport.id}
            >
              <span className={styles.segmentMark} aria-hidden="true">
                {selected ? "●" : "○"}
              </span>
              <span>{viewport.label}</span>
              <span className={styles.segmentName}>{viewport.width} px</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

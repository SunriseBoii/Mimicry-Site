import type { Variant, VariantId } from "../_data/variants";
import styles from "../_styles/visual-lab.module.css";

type VariantSwitcherProps = {
  items: readonly Variant[];
  value: VariantId;
  onChange: (value: VariantId) => void;
};

export function VariantSwitcher({
  items,
  value,
  onChange,
}: VariantSwitcherProps) {
  return (
    <div className={styles.controlGroup}>
      <p className={styles.controlLabel}>Визуальное направление</p>
      <div className={styles.segmentedControl} role="group" aria-label="Визуальное направление">
        {items.map((item) => {
          const selected = item.id === value;

          return (
            <button
              className={styles.segmentButton}
              data-selected={selected ? "true" : "false"}
              type="button"
              aria-pressed={selected}
              onClick={() => onChange(item.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onChange(item.id);
                }
              }}
              key={item.id}
            >
              <span className={styles.segmentMark} aria-hidden="true">
                {selected ? "●" : "○"}
              </span>
              <span>{item.shortLabel}</span>
              <span className={styles.segmentName}>{item.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

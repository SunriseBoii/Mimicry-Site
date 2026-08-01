import { Label } from "./Label";
import styles from "./route-marker.module.css";

export type RouteStepState = "complete" | "current" | "upcoming";

export type RouteStep = {
  description?: string;
  label: string;
  state?: RouteStepState;
};

type RouteMarkerProps = {
  ariaLabel: string;
  steps: readonly RouteStep[];
};

const stateLabels: Record<RouteStepState, string> = {
  complete: "Связано",
  current: "Текущий этап",
  upcoming: "Следующий этап",
};

export function RouteMarker({ ariaLabel, steps }: RouteMarkerProps) {
  return (
    <ol className={styles.route} aria-label={ariaLabel}>
      {steps.map((step, index) => {
        const state = step.state ?? "upcoming";

        return (
          <li className={styles.step} data-state={state} key={step.label}>
            <span className={styles.node} aria-hidden="true" />
            <div className={styles.content}>
              <Label variant="process">0{index + 1}</Label>
              <strong>{step.label}</strong>
              {step.description ? <p>{step.description}</p> : null}
              <span className={styles.stateText}>{stateLabels[state]}</span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

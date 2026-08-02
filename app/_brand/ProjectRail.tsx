import type { CSSProperties } from "react";
import {
  competenceMeta,
  competenceOrder,
  type CompetenceId,
} from "./color-system";
import { CompetenceMotif } from "./CompetenceMotif";
import styles from "./color-components.module.css";

type ProjectRailProps = {
  competencies: readonly CompetenceId[];
  lead?: CompetenceId;
  label?: string;
  showLegend?: boolean;
};

type SegmentStyle = CSSProperties & { "--project-weight": number };

function getWeights(items: CompetenceId[], lead?: CompetenceId) {
  if (!lead || !items.includes(lead)) {
    return Object.fromEntries(items.map((item) => [item, 1])) as Record<
      CompetenceId,
      number
    >;
  }

  const leadWeight = items.length === 2 ? 58 : items.length === 3 ? 50 : 46;
  const supportWeight = (100 - leadWeight) / (items.length - 1);
  return Object.fromEntries(
    items.map((item) => [item, item === lead ? leadWeight : supportWeight]),
  ) as Record<CompetenceId, number>;
}

export function ProjectRail({
  competencies,
  lead,
  label,
  showLegend = true,
}: ProjectRailProps) {
  const uniqueItems = competenceOrder.filter((item) =>
    competencies.includes(item),
  );
  if (uniqueItems.length === 0) return null;

  const actualLead = lead && uniqueItems.includes(lead) ? lead : uniqueItems[0];
  const weights = getWeights(uniqueItems, lead);
  const description =
    label ?? uniqueItems.map((item) => competenceMeta[item].label).join(", ");

  return (
    <div className={styles.projectRailContainer}>
      <div
        aria-label={`Состав проекта: ${description}`}
        className={styles.projectRail}
        data-count={uniqueItems.length}
        data-lead={lead}
        role="img"
      >
        <div className={styles.projectSegments}>
          {uniqueItems.map((item, index) => (
            <span
              aria-hidden="true"
              className={styles.projectSegment}
              data-competence={item}
              data-lead={item === lead ? "true" : undefined}
              key={item}
              style={
                {
                  "--project-weight": weights[item],
                  animationDelay: `${index * 60}ms`,
                } as SegmentStyle
              }
            />
          ))}
        </div>
        <span
          className={styles.projectCompact}
          data-competence={actualLead}
          aria-hidden="true"
        >
          <span />+{Math.max(0, uniqueItems.length - 1)}
        </span>
      </div>

      {showLegend ? (
        <ul className={styles.projectLegend} aria-label="Подписи состава проекта">
          {uniqueItems.map((item) => (
            <li data-competence={item} key={item}>
              <CompetenceMotif competence={item} />
              <span>
                {competenceMeta[item].label}
                {item === lead ? " · lead" : ""}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

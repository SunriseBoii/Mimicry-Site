"use client";

import type { CSSProperties, ReactNode } from "react";
import { useState } from "react";
import type {
  PlaceholderMode,
  VariantId,
  ViewportId,
} from "../_data/variants";
import { variants, viewports } from "../_data/variants";
import variantA from "../_styles/variant-a.module.css";
import variantB from "../_styles/variant-b.module.css";
import variantC from "../_styles/variant-c.module.css";
import styles from "../_styles/visual-lab.module.css";
import tokenStyles from "../../_design-system/theme/tokens.module.css";
import { VariantSwitcher } from "./VariantSwitcher";
import { ViewportSwitcher } from "./ViewportSwitcher";

const variantClasses: Record<VariantId, string> = {
  a: variantA.variantA,
  b: variantB.variantB,
  c: variantC.variantC,
};

export function VisualLabShell({ children }: { children: ReactNode }) {
  const [variantId, setVariantId] = useState<VariantId>("a");
  const [viewportId, setViewportId] = useState<ViewportId>("desktop");
  const [placeholderMode, setPlaceholderMode] =
    useState<PlaceholderMode>("neutral");
  const [reducedMotion, setReducedMotion] = useState(false);

  const activeVariant =
    variants.find((variant) => variant.id === variantId) ?? variants[0];
  const activeViewport =
    viewports.find((viewport) => viewport.id === viewportId) ?? viewports[0];
  const previewStyle = {
    "--preview-width": `${activeViewport.width}px`,
  } as CSSProperties;

  return (
    <main className={`${styles.labRoot} ${tokenStyles.tokens}`}>
      <header className={styles.labHeader}>
        <div className={styles.labIdentity}>
          <p className={styles.labKicker}>Mimicry group · Visual system checkpoint</p>
          <h1>Visual Lab</h1>
          <p>
            Три визуальных направления, один контент и один semantic DOM.
            Служебный маршрут не связан с production-навигацией.
          </p>
        </div>

        <div className={styles.toolbar} aria-label="Управление лабораторией">
          <VariantSwitcher
            items={variants}
            value={variantId}
            onChange={setVariantId}
          />
          <ViewportSwitcher value={viewportId} onChange={setViewportId} />

          <div className={styles.controlGroup}>
            <p className={styles.controlLabel}>Placeholder</p>
            <div className={styles.segmentedControl} role="group" aria-label="Состояние placeholder">
              <button
                className={styles.segmentButton}
                data-selected={placeholderMode === "neutral" ? "true" : "false"}
                type="button"
                aria-pressed={placeholderMode === "neutral"}
                onClick={() => setPlaceholderMode("neutral")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setPlaceholderMode("neutral");
                  }
                }}
              >
                <span className={styles.segmentMark} aria-hidden="true">
                  {placeholderMode === "neutral" ? "●" : "○"}
                </span>
                Neutral
              </button>
              <button
                className={styles.segmentButton}
                data-selected={placeholderMode === "documentary" ? "true" : "false"}
                type="button"
                aria-pressed={placeholderMode === "documentary"}
                onClick={() => setPlaceholderMode("documentary")}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setPlaceholderMode("documentary");
                  }
                }}
              >
                <span className={styles.segmentMark} aria-hidden="true">
                  {placeholderMode === "documentary" ? "●" : "○"}
                </span>
                Documentary slot
              </button>
            </div>
          </div>

          <div className={styles.controlGroup}>
            <p className={styles.controlLabel}>Motion</p>
            <button
              className={styles.toggleButton}
              data-selected={reducedMotion ? "true" : "false"}
              type="button"
              aria-pressed={reducedMotion}
              onClick={() => setReducedMotion((value) => !value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setReducedMotion((value) => !value);
                }
              }}
            >
              <span className={styles.toggleTrack} aria-hidden="true">
                <span />
              </span>
              Reduced motion {reducedMotion ? "включён" : "выключен"}
            </button>
          </div>
        </div>

        <section className={styles.tokenPanel} aria-labelledby="active-tokens-title">
          <div className={styles.tokenHeading}>
            <p id="active-tokens-title">Активные tokens</p>
            <strong>
              {activeVariant.shortLabel} · {activeVariant.name}
            </strong>
            <span>{activeVariant.role}</span>
          </div>
          <dl className={styles.tokenList}>
            {activeVariant.tokens.map((token) => (
              <div className={styles.tokenItem} key={token.label}>
                <dt>
                  {token.color ? (
                    <span
                      className={styles.swatch}
                      style={{ backgroundColor: token.color }}
                      aria-hidden="true"
                    />
                  ) : null}
                  {token.label}
                </dt>
                <dd>{token.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </header>

      <section className={styles.previewRegion} aria-label="Предпросмотр визуального направления">
        <div className={styles.previewStage} tabIndex={0} aria-label={`Прокручиваемый preview шириной ${activeViewport.width} пикселей`}>
          <div
            className={`${styles.previewSurface} ${variantClasses[variantId]}`}
            style={previewStyle}
            data-variant={variantId}
            data-placeholder={placeholderMode}
            data-reduced-motion={reducedMotion ? "true" : "false"}
          >
            <div className={styles.previewChrome}>
              <span>MIMICRY / VISUAL-LAB</span>
              <span>
                {activeVariant.shortLabel} · {activeViewport.width} PX · {placeholderMode.toUpperCase()}
              </span>
            </div>
            <div className={styles.previewCanvas}>{children}</div>
          </div>
        </div>
        <p className={styles.scrollHint}>
          Preview использует фактическую ширину. На узком экране горизонтально
          прокручивается только эта область, не страница.
        </p>
      </section>

      <p className={styles.labNotice} id="lab-notice">
        Служебный прототип: ссылки демонстрируют состояния и маршрут; данные не
        отправляются, подтверждённые фотографии и метрики не подставляются.
      </p>
    </main>
  );
}

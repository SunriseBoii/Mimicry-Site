"use client";

import dynamic from "next/dynamic";
import type { CSSProperties } from "react";
import styles from "./visual-actor.module.css";
import type { VisualActorProps } from "./types";
import {
  PHOTONIC_ACTIVE_ZONE_RATIO,
  expandPalette,
  getTransitionPolicy,
  resolvePhotonicPresentation,
} from "./visual-actor-state";

const PhotonicSkinScene = dynamic(
  () =>
    import("./photonic-skin/PhotonicSkinScene").then(
      (module) => module.PhotonicSkinScene,
    ),
  { ssr: false, loading: () => null },
);

export function VisualActorPoster({
  state,
  theme,
}: Pick<VisualActorProps, "state" | "theme">) {
  const presentation = resolvePhotonicPresentation(state);
  const palette = expandPalette(presentation.palette);
  const posterStyle = {
    "--poster-01": palette[0],
    "--poster-02": palette[1],
    "--poster-03": palette[2],
    "--poster-04": palette[3],
    "--poster-05": palette[4],
    "--poster-06": palette[5],
    "--poster-07": palette[6],
    "--poster-active-zone": `${PHOTONIC_ACTIVE_ZONE_RATIO * 100}%`,
  } as CSSProperties;

  return (
    <div
      className={styles.poster}
      data-theme={theme}
      data-morph={presentation.morph}
      style={posterStyle}
      aria-hidden="true"
    >
      <div className={styles.posterShadow} />
      <div className={styles.posterShell}>
        <div className={styles.posterSpectrum} />
        <div className={styles.posterHighlight} />
      </div>
      <span className={styles.posterLabel}>STABLE POSTER / WEBGL FALLBACK</span>
    </div>
  );
}

/**
 * Current actor resolver. A future actor selection can happen here without
 * changing the page-level VisualActorProps contract.
 */
export function VisualActor({
  state,
  theme,
  motionMode,
  className,
}: VisualActorProps) {
  const policy = getTransitionPolicy(motionMode, false);

  return (
    <div
      className={[styles.actor, className].filter(Boolean).join(" ")}
      data-motion-mode={motionMode}
      data-geometry-morph={policy.canMorphGeometry ? "enabled" : "disabled"}
      aria-hidden="true"
    >
      <VisualActorPoster state={state} theme={theme} />
      <PhotonicSkinScene
        state={state}
        theme={theme}
        motionMode={motionMode}
      />
    </div>
  );
}


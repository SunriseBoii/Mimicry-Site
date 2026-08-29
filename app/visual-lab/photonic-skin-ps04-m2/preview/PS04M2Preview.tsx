"use client";

import { useEffect, useMemo, useState } from "react";
import { usePS04Runtime } from "../../photonic-skin-ps04-m1/use-ps04-runtime";
import {
  MATERIAL_THEME_PRESETS,
  defaultM2MaterialController,
  type MaterialTheme,
} from "../material-foundation";
import { PhotonicPaletteController } from "../palette-controller";
import { ALL_COMPETENCE_MASK } from "../photonic-palette";
import { PS04M2Scene, type SceneStats } from "../PS04M2Scene";
import styles from "./preview.module.css";

type PreviewMode = MaterialTheme | "both";
const MASTER = "master-neutral";
const STATIC_TARGET = "single-event";

function formatInteger(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function HeroSpecimen({
  theme,
  scene,
  colorController,
}: {
  theme: MaterialTheme;
  scene: ReturnType<typeof usePS04Runtime>;
  colorController: PhotonicPaletteController;
}) {
  const [stats, setStats] = useState<SceneStats | null>(null);
  const material = useMemo(() => ({
    ...defaultM2MaterialController(theme, colorController),
    reducedMotion: true,
  }), [colorController, theme]);
  const preset = MATERIAL_THEME_PRESETS[theme];
  const style = {
    "--preview-background": preset.background,
    "--preview-ink": theme === "light" ? "#111315" : "#F1F2EF",
    "--preview-muted": theme === "light" ? "#6F716D" : "#999F9E",
  } as React.CSSProperties;

  return (
    <section className={styles.hero} data-theme={theme} style={style}>
      <div className={styles.contentSafeZone}>
        <div className={styles.wordmark}>MIMICRY GROUP</div>
        <p className={styles.eyebrow}>Corporate communications · special projects</p>
        <h1>Meaningful work<br />deserves attention.</h1>
        <p className={styles.lede}>Seven competences move as one continuous actor-space color field.</p>
        <div className={styles.mockActions}><span>Start a project</span><span>See selected work</span></div>
      </div>
      <div className={styles.actorLayer} aria-label={`Photonic Skin ${theme} color field preview`}>
        {scene.source && scene.target && scene.program && scene.manifest ? (
          <PS04M2Scene
            source={scene.source}
            target={scene.target}
            program={scene.program}
            budget={16384}
            progress={0}
            reducedMotion
            debugMode="neutral"
            cameraPreset="canonical"
            presentationContract={scene.manifest.presentationContract}
            profile="desktop"
            dpr={1.5}
            diagnosticId={`preview-${theme}`}
            selectedId={-1}
            evaluator="m4"
            material={material}
            geometryPlayback={false}
            onStats={setStats}
          />
        ) : null}
      </div>
      <div className={styles.previewMeta}>
        <span>{theme} / fixed phase 0.31</span>
        <span>{stats ? `${stats.drawCalls} draw · ${formatInteger(stats.triangles)} tri · ${stats.textures} textures` : "loading frozen actor"}</span>
      </div>
    </section>
  );
}

export function PS04M2Preview() {
  const [mode, setMode] = useState<PreviewMode>(() => {
    const requested = new URLSearchParams(window.location.search).get("theme");
    return requested === "light" || requested === "dark" || requested === "both" ? requested : "light";
  });
  const colorController = useMemo(() => {
    const next = new PhotonicPaletteController(ALL_COMPETENCE_MASK, 32);
    next.setPhase(0.31);
    next.setPlaying(false);
    next.setReducedMotion(true);
    return next;
  }, []);
  // Use a frozen verified route as the carrier, then render its exact t=0 MASTER endpoint.
  const runtime = usePS04Runtime({ initialSourceId: MASTER, initialTargetId: STATIC_TARGET, reducedMotion: false });

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    query.set("theme", mode);
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [mode]);

  return (
    <main className={styles.previewShell} data-theme={mode}>
      <nav className={styles.previewNav} aria-label="Preview theme">
        <a href="/visual-lab/photonic-skin-ps04-m2">← Color field lab</a>
        <div>{(["light", "dark", "both"] as const).map((value) => (
          <button key={value} data-active={mode === value} onClick={() => setMode(value)}>{value}</button>
        ))}</div>
      </nav>
      {runtime.error ? <p className={styles.previewError}>{runtime.error}</p> : null}
      {mode === "both" ? (
        <div className={styles.previewComparison}>
          <HeroSpecimen theme="light" scene={runtime} colorController={colorController} />
          <HeroSpecimen theme="dark" scene={runtime} colorController={colorController} />
        </div>
      ) : <HeroSpecimen theme={mode} scene={runtime} colorController={colorController} />}
    </main>
  );
}

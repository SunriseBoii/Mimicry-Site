"use client";

import { useEffect, useMemo, useState } from "react";
import {
  MATERIAL_THEME_PRESETS,
  defaultMaterialController,
  type MaterialTheme,
} from "../material-foundation";
import { PS04M1Scene, type SceneStats } from "../PS04M1Scene";
import { usePS04Runtime } from "../use-ps04-runtime";
import styles from "./preview.module.css";

type PreviewMode = MaterialTheme | "both";

const MASTER = "master-neutral";

function HeroSpecimen({
  theme,
  scene,
}: {
  theme: MaterialTheme;
  scene: ReturnType<typeof usePS04Runtime>;
}) {
  const [stats, setStats] = useState<SceneStats | null>(null);
  const controller = useMemo(() => defaultMaterialController(theme), [theme]);
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
        <p className={styles.lede}>
          Neutral hero context for reviewing Photonic Skin as a continuous site actor.
        </p>
        <div className={styles.mockActions}>
          <span>Start a project</span>
          <span>See selected work</span>
        </div>
      </div>
      <div className={styles.actorLayer} aria-label={"Photonic Skin " + theme + " material preview"}>
        {scene.source && scene.target && scene.program && scene.manifest ? (
          <PS04M1Scene
            source={scene.source}
            target={scene.target}
            program={scene.program}
            budget={16384}
            progress={1}
            reducedMotion
            debugMode="neutral"
            cameraPreset="canonical"
            presentationContract={scene.manifest.presentationContract}
            profile="desktop"
            dpr={1.5}
            diagnosticId={"preview-" + theme}
            selectedId={-1}
            evaluator="m4"
            material={controller}
            onStats={setStats}
          />
        ) : null}
      </div>
      <div className={styles.previewMeta}>
        <span>{theme} / 1440×900 target</span>
        <span>{stats ? stats.drawCalls + " draw · " + stats.triangles.toLocaleString() + " tri" : "loading frozen actor"}</span>
      </div>
    </section>
  );
}

export function PS04M1Preview() {
  const [mode, setMode] = useState<PreviewMode>("light");
  const runtime = usePS04Runtime({
    initialSourceId: MASTER,
    initialTargetId: MASTER,
    reducedMotion: true,
  });

  useEffect(() => {
    let mounted = true;
    queueMicrotask(() => {
      if (!mounted) return;
      const requested = new URLSearchParams(window.location.search).get("theme");
      if (requested === "light" || requested === "dark" || requested === "both") setMode(requested);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    query.set("theme", mode);
    window.history.replaceState(null, "", window.location.pathname + "?" + query);
  }, [mode]);

  return (
    <main className={styles.previewShell}>
      <nav className={styles.previewNav} aria-label="Preview theme">
        <a href="/visual-lab/photonic-skin-ps04-m1">← Material lab</a>
        <div>
          {(["light", "dark", "both"] as const).map((value) => (
            <button key={value} data-active={mode === value} onClick={() => setMode(value)}>
              {value}
            </button>
          ))}
        </div>
      </nav>
      {runtime.error ? <p className={styles.previewError}>{runtime.error}</p> : null}
      {mode === "both" ? (
        <div className={styles.previewComparison}>
          <HeroSpecimen theme="light" scene={runtime} />
          <HeroSpecimen theme="dark" scene={runtime} />
        </div>
      ) : (
        <HeroSpecimen theme={mode} scene={runtime} />
      )}
    </main>
  );
}

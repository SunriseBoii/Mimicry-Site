"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { M3Manifest } from "../../photonic-skin-m4-1/m41-data";
import { loadRuntimeManifests } from "../../photonic-skin-m4-1/m41-data";
import {
  MATERIAL_THEME_PRESETS,
  defaultM2MaterialController,
  type MaterialTheme,
} from "../material-foundation";
import { compileFrozenPair, loadEntry } from "../runtime";
import { PhotonicMotionSession } from "../session";
import { PS04M3Scene, type SceneStats } from "../PS04M3Scene";
import styles from "./preview.module.css";

type PreviewMode = MaterialTheme | "both";

function formatInteger(value: number) {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

function HeroSpecimen({
  theme,
  session,
  manifest,
  shouldAnimate,
}: {
  theme: MaterialTheme;
  session: PhotonicMotionSession;
  manifest: M3Manifest;
  shouldAnimate: boolean;
}) {
  const [stats, setStats] = useState<SceneStats | null>(null);
  const source = session.getSource();
  const target = session.getTarget();
  const program = session.getProgram();
  const ui = session.snapshot();
  const material = useMemo(() => ({
    ...defaultM2MaterialController(theme, session.palette),
    reducedMotion: ui.reducedMotion,
  }), [session.palette, theme, ui.reducedMotion]);
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
        <p className={styles.lede}>The actor breathes and turns as one body. Color stays on the skin.</p>
        <div className={styles.mockActions}><span>Start a project</span><span>See selected work</span></div>
      </div>
      <div className={styles.actorLayer} aria-label={`Photonic Skin ${theme} motion preview`}>
        {source && target && program ? (
          <PS04M3Scene
            source={source}
            target={target}
            program={program}
            budget={16384}
            progress={ui.geometryProgress}
            reducedMotion={ui.reducedMotion}
            debugMode="neutral"
            cameraPreset="canonical"
            presentationContract={manifest.presentationContract}
            profile="desktop"
            dpr={1.5}
            diagnosticId={`preview-${theme}`}
            selectedId={-1}
            evaluator="m4"
            material={material}
            overlay={ui.overlay}
            session={session}
            sessionShouldAnimate={shouldAnimate}
            onStats={setStats}
          />
        ) : null}
      </div>
      <div className={styles.previewMeta}>
        <span>{theme} / idle {ui.family} / scale {ui.displayed.scale.toFixed(4)}</span>
        <span>{stats
          ? (stats.newFrame
            ? `${stats.drawCalls} draw · ${formatInteger(stats.triangles)} tri`
            : `${stats.lastActorDrawCalls} last draw · ${formatInteger(stats.lastActorTriangles)} tri · no new frame`)
          : "loading actor"}</span>
      </div>
    </section>
  );
}

export function PS04M3Preview() {
  const [mode, setMode] = useState<PreviewMode>(() => {
    const requested = new URLSearchParams(window.location.search).get("theme");
    return requested === "light" || requested === "dark" || requested === "both" ? requested : "light";
  });
  const [manifest, setManifest] = useState<M3Manifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [animate, setAnimate] = useState(false);
  const reduced = typeof window !== "undefined" && (
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
    || new URLSearchParams(window.location.search).get("reduced") === "1"
  );
  const session = useMemo(() => new PhotonicMotionSession({
    reducedMotion: reduced,
    overlayMode: "m3-idle",
    profile: "desktop",
  }), [reduced]);
  const clock = useRef({ frame: 0, previous: 0, token: 0 });

  useEffect(() => {
    const controller = new AbortController();
    loadRuntimeManifests(controller.signal).then(async ({ m3, m4 }) => {
      const entry = m3.states.find((item) => item.stateId === "master-neutral") ?? m3.states[0];
      const state = await loadEntry(entry);
      const program = await compileFrozenPair(state, state, m3, m4, { reducedMotion: reduced, trigger: "preview" });
      session.bootstrapSettled(state, program);
      setManifest(m3);
      setReady(true);
    }).catch((reason: Error) => {
      if (reason.name !== "AbortError") setError(reason.message);
    });
    return () => controller.abort();
  }, [reduced, session]);

  useEffect(() => {
    if (!ready) return;
    const clockState = clock.current;
    const loop = (now: number) => {
      const hidden = document.visibilityState === "hidden";
      session.setHidden(hidden);
      if (!hidden) session.tick((now - clockState.previous) / 1000, ++clockState.token);
      clockState.previous = now;
      setAnimate(session.shouldAnimate());
      clockState.frame = requestAnimationFrame(loop);
    };
    clockState.previous = performance.now();
    clockState.frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(clockState.frame);
  }, [ready, session]);

  useEffect(() => {
    const query = new URLSearchParams(window.location.search);
    query.set("theme", mode);
    window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  }, [mode]);

  useEffect(() => {
    window.__PS04M3_PREVIEW__ = {
      ready,
      theme: mode,
      snapshot: () => session.snapshot(),
    };
  }, [mode, ready, session]);

  return (
    <main className={styles.previewShell} data-theme={mode} data-qa="ps04m3-preview">
      <nav className={styles.previewNav} aria-label="Preview theme">
        <a href="/visual-lab/photonic-skin-ps04-m3">← Motion lab</a>
        <div>{(["light", "dark", "both"] as const).map((value) => (
          <button key={value} data-active={mode === value} onClick={() => setMode(value)}>{value}</button>
        ))}</div>
      </nav>
      {error ? <p className={styles.previewError}>{error}</p> : null}
      {manifest && ready ? (mode === "both" ? (
        <div className={styles.previewComparison}>
          <HeroSpecimen theme="light" session={session} manifest={manifest} shouldAnimate={animate} />
          <HeroSpecimen theme="dark" session={session} manifest={manifest} shouldAnimate={animate} />
        </div>
      ) : <HeroSpecimen theme={mode} session={session} manifest={manifest} shouldAnimate={animate} />) : null}
    </main>
  );
}

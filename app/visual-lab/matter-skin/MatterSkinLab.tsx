"use client";

import dynamic from "next/dynamic";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  loadMatterSkinData,
  sampleCounts,
  sampleTimeline,
  SCALE_COUNT,
  type DecodedRows,
  type DecodedStatics,
  type Manifest,
} from "./matter-skin-data";
import {
  CYCLE_SPEED,
  LAB_STATES,
  type DebugMode,
  type InitialMatterLabSettings,
  type MotionProfile,
  type PreviewMode,
} from "./matter-lab-config";
import type { SceneStats } from "./MatterSkinScene";
import styles from "./matter-skin.module.css";

const MatterSkinScene = dynamic(
  () => import("./MatterSkinScene").then((m) => m.MatterSkinScene),
  { ssr: false },
);

interface LoadedData {
  manifest: Manifest;
  rows: DecodedRows;
  statics: DecodedStatics;
  fetchedBytes: number;
}

function useSystemReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  return reduced;
}

const SEGMENT_LABELS: Record<string, string> = {
  "sphere-book": "Sphere → Book",
  "book-game": "Book → Gamepad + Queen",
  "game-sphere": "Gamepad + Queen → Sphere",
};

export function MatterSkinLab({
  initialSettings,
}: {
  initialSettings: InitialMatterLabSettings;
}) {
  const [data, setData] = useState<LoadedData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadMs, setLoadMs] = useState(0);

  const initialProgress =
    LAB_STATES.find((s) => s.id === initialSettings.stateId)?.progress ?? 0;
  const progressRef = useRef<number>(initialProgress);
  const playingRef = useRef(false);
  const speedRef = useRef(CYCLE_SPEED);

  const [progressUi, setProgressUi] = useState<number>(initialProgress);
  const [playing, setPlaying] = useState(false);
  const [scrollScrub, setScrollScrub] = useState(false);
  const [debugMode, setDebugMode] = useState<DebugMode>(
    initialSettings.debugMode,
  );
  const [previewMode, setPreviewMode] = useState<PreviewMode>(
    initialSettings.previewMode,
  );
  const [motionProfile, setMotionProfile] = useState<MotionProfile>(
    initialSettings.motionProfile,
  );
  const [cameraResetToken, setCameraResetToken] = useState(0);
  const [stats, setStats] = useState<SceneStats>({
    fps: 0,
    frameMs: 0,
    drawCalls: 0,
    triangles: 0,
  });

  const systemReducedMotion = useSystemReducedMotion();
  const reducedMotion = motionProfile === "reduced" || systemReducedMotion;

  useEffect(() => {
    let cancelled = false;
    const started = performance.now();
    loadMatterSkinData()
      .then((loaded) => {
        if (cancelled) return;
        setLoadMs(Math.round(performance.now() - started));
        setData(loaded);
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const query = new URLSearchParams({
      preview: previewMode,
      motion: motionProfile,
      debug: debugMode,
    });
    window.history.replaceState(null, "", `?${query.toString()}`);
  }, [previewMode, motionProfile, debugMode]);

  const setProgress = useCallback((value: number) => {
    const wrapped = ((value % 3) + 3) % 3;
    progressRef.current = wrapped;
    setProgressUi(wrapped);
  }, []);

  const goToState = useCallback(
    (progress: number) => {
      playingRef.current = false;
      setPlaying(false);
      setProgress(progress);
    },
    [setProgress],
  );

  const togglePlay = useCallback(() => {
    if (reducedMotion) return;
    playingRef.current = !playingRef.current;
    setPlaying(playingRef.current);
  }, [reducedMotion]);

  const onWheelScrub = useCallback(
    (event: React.WheelEvent) => {
      if (!scrollScrub) return;
      playingRef.current = false;
      setPlaying(false);
      setProgress(progressRef.current + event.deltaY * 0.0016);
    },
    [scrollScrub, setProgress],
  );

  const timeline = useMemo(
    () => (data ? sampleTimeline(data.manifest, progressUi) : null),
    [data, progressUi],
  );
  const counts = useMemo(
    () => (data ? sampleCounts(data.manifest, progressUi) : null),
    [data, progressUi],
  );

  const activeSegment = timeline
    ? data!.manifest.segments[timeline.segment].name
    : "sphere-book";
  const atEndState = timeline
    ? timeline.localT < 0.004 || timeline.localT > 0.996
    : true;
  const phaseLabel = atEndState ? "idle" : timeline?.phase ?? "idle";

  const volumeErrorPct = counts
    ? ((counts.volume - (data?.manifest.v0 ?? 1)) / (data?.manifest.v0 ?? 1)) *
      100
    : 0;

  return (
    <main
      className={styles.lab}
      data-preview={previewMode}
      data-motion={reducedMotion ? "reduced" : "full"}
    >
      <header className={styles.header}>
        <a href="#matter-viewport" className={styles.wordmark}>
          MIMICRY <span>GROUP</span>
        </a>
        <div className={styles.headerMeta}>
          <span>PS-03.M</span>
          <span>MATTER &amp; SKIN LAB</span>
          <span>INTERNAL / NOINDEX</span>
        </div>
      </header>

      <div className={styles.stage}>
        <section
          className={styles.viewportShell}
          id="matter-viewport"
          onWheel={onWheelScrub}
          aria-label="PS-03.M viewport"
        >
          {loadError ? (
            <div className={styles.fallback}>
              <strong>Данные PS-03.M не найдены.</strong>
              <p>{loadError}</p>
              <p>
                Запустите offline-пайплайн:{" "}
                <code>python design/photonic-skin/ps-03-m/scripts/build_ps03m.py</code>
              </p>
            </div>
          ) : data ? (
            <MatterSkinScene
              manifest={data.manifest}
              rows={data.rows}
              statics={data.statics}
              progressRef={progressRef}
              playingRef={playingRef}
              speedRef={speedRef}
              debugMode={debugMode}
              reducedMotion={reducedMotion}
              cameraResetToken={cameraResetToken}
              scrollEnabled={scrollScrub}
              onProgressChange={setProgressUi}
              onStats={setStats}
            />
          ) : (
            <div className={styles.fallback}>Загрузка baked-данных…</div>
          )}

          <div className={styles.viewportTopline}>
            <span>{SEGMENT_LABELS[activeSegment]}</span>
            <span>
              PHASE: <b>{phaseLabel.toUpperCase()}</b>
            </span>
            <span>
              COMPONENTS: <b>{counts?.components ?? "—"}</b>
            </span>
          </div>
        </section>

        <aside className={styles.controls} aria-label="Управление Matter Skin Lab">
          <div className={styles.controlsIntro}>
            <span>LAB CONTROLS</span>
            <p>
              Полный цикл: sphere → book → gamepad + queen → sphere. 8192
              стабильных ID, объём ±1%.
            </p>
          </div>

          <fieldset className={styles.controlGroup}>
            <legend>State</legend>
            <div className={styles.buttons}>
              {LAB_STATES.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  data-selected={
                    Math.abs(progressUi - option.progress) < 0.01 ||
                    (option.progress === 0 &&
                      Math.abs(progressUi - 3) < 0.01)
                      ? "true"
                      : "false"
                  }
                  onClick={() => goToState(option.progress)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.controlGroup}>
            <legend>Cycle</legend>
            <div className={styles.buttons}>
              <button
                type="button"
                onClick={togglePlay}
                disabled={reducedMotion}
                data-selected={playing ? "true" : "false"}
              >
                {playing ? "❚❚ Pause" : "▶ Play"}
              </button>
              <button
                type="button"
                data-selected={scrollScrub ? "true" : "false"}
                onClick={() => setScrollScrub((v) => !v)}
              >
                Scroll scrub
              </button>
            </div>
            <label className={styles.scrubber}>
              <span>
                progress {progressUi.toFixed(3)} / 3 · t=
                {(timeline?.localT ?? 0).toFixed(2)}
              </span>
              <input
                type="range"
                min={0}
                max={3}
                step={0.001}
                value={progressUi}
                onChange={(event) => {
                  playingRef.current = false;
                  setPlaying(false);
                  setProgress(Number(event.target.value));
                }}
              />
            </label>
          </fieldset>

          <fieldset className={styles.controlGroup}>
            <legend>Debug</legend>
            <div className={styles.buttons}>
              {(["none", "components", "reserve"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-selected={debugMode === mode ? "true" : "false"}
                  onClick={() => setDebugMode(mode)}
                >
                  {mode === "none"
                    ? "Off"
                    : mode === "components"
                      ? "Components"
                      : "Surface/Reserve"}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset className={styles.controlGroup}>
            <legend>Profile</legend>
            <div className={styles.buttons}>
              {(["desktop", "mobile"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-selected={previewMode === mode ? "true" : "false"}
                  onClick={() => setPreviewMode(mode)}
                >
                  {mode === "desktop" ? "Desktop" : "Mobile 390"}
                </button>
              ))}
              {(["full", "reduced"] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  data-selected={motionProfile === mode ? "true" : "false"}
                  onClick={() => setMotionProfile(mode)}
                >
                  {mode === "full" ? "Motion full" : "Reduced"}
                </button>
              ))}
            </div>
            {systemReducedMotion ? (
              <p className={styles.note}>system prefers-reduced-motion active</p>
            ) : null}
          </fieldset>

          <fieldset className={styles.controlGroup}>
            <legend>Camera</legend>
            <div className={styles.buttons}>
              <button
                type="button"
                onClick={() => setCameraResetToken((token) => token + 1)}
              >
                Canonical preset / reset
              </button>
            </div>
          </fieldset>

          <section className={styles.readout} aria-live="polite">
            <div>
              <span>Scales</span>
              <strong>
                {counts
                  ? counts.visible + counts.transition + counts.reserve
                  : SCALE_COUNT}{" "}
                / {SCALE_COUNT}
              </strong>
            </div>
            <div>
              <span>Visible / transition / reserve</span>
              <strong>
                {counts
                  ? `${counts.visible} / ${counts.transition} / ${counts.reserve}`
                  : "—"}
              </strong>
            </div>
            <div>
              <span>Volume vs V₀</span>
              <strong>
                {counts
                  ? `${counts.volume.toFixed(3)} (${volumeErrorPct >= 0 ? "+" : ""}${volumeErrorPct.toFixed(2)}%)`
                  : "—"}
              </strong>
            </div>
            <div>
              <span>Frame</span>
              <strong>
                {stats.fps} fps · {stats.frameMs} ms
              </strong>
            </div>
            <div>
              <span>Draw calls / triangles</span>
              <strong>
                {stats.drawCalls} / {stats.triangles.toLocaleString("ru-RU")}
              </strong>
            </div>
            <div>
              <span>Data / load</span>
              <strong>
                {data
                  ? `${(data.fetchedBytes / 1024 / 1024).toFixed(2)} MB · ${loadMs} ms`
                  : "—"}
              </strong>
            </div>
          </section>
        </aside>
      </div>

      <footer className={styles.footer}>
        <span>PS-03.M / MATTER &amp; SKIN ARCHITECTURE SPIKE</span>
        <span>8192 FIXED IDS · TRUE SPLIT/MERGE · WEBGL2 BASELINE</span>
      </footer>
    </main>
  );
}

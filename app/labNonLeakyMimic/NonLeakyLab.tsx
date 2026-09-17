"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { loadBuilderRuntime, loadBuilderState } from "../visual-lab/photonic-skin-ps04-m6/project-builder-semantics/delta-runtime";
import type { StateEntry } from "../visual-lab/photonic-skin-m4-1/m41-data";
import { PHOTONIC_COLOR_HEX } from "../visual-lab/photonic-skin-ps04-m2/photonic-palette";
import { competenceMeta, competenceOrder, type CompetenceId } from "../_brand/color-system";
import { mixFields } from "./surface-field";
import { samplesFor } from "./surface-samples";
import { buildFieldInWorker } from "./build-field-client";
import { SurfaceCanvas, type SurfaceEndpoint } from "./SurfaceCanvas";
import styles from "./surface-lab.module.css";

function paletteFor(entry: StateEntry) {
  const ids = entry.competencyIds.length ? entry.competencyIds : competenceOrder;
  return ids.map(id => PHOTONIC_COLOR_HEX[id as CompetenceId]).filter(Boolean);
}
function stateLabel(entry: StateEntry) {
  if (entry.stateId === "master-neutral") return "Мастер-сфера";
  if (entry.stateRole === "single") return competenceMeta[entry.competencyIds[0] as CompetenceId]?.label ?? entry.stateId;
  return entry.stateId.replaceAll("project-complex-", "Проект · ").replaceAll("complex-", "").replaceAll("brand-wide-", "Все · ");
}

export default function NonLeakyLab() {
  const [entries, setEntries] = useState<StateEntry[]>([]);
  const [selected, setSelected] = useState("master-neutral");
  const [pair, setPair] = useState<{ source: SurfaceEndpoint; target: SurfaceEndpoint } | null>(null);
  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [dark, setDark] = useState(false);
  const [background, setBackground] = useState("plain");
  const [density, setDensity] = useState(18);
  const [relief, setRelief] = useState(.42);
  const [zoom, setZoom] = useState(1);
  const [rotating, setRotating] = useState(false);
  const [mask, setMask] = useState(false);
  const [reset, setReset] = useState(0);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [loadMs, setLoadMs] = useState(0);
  const request = useRef(0);
  const cache = useRef(new Map<string, SurfaceEndpoint>());
  const current = useRef({ pair, progress });
  useEffect(() => { current.current = { pair, progress }; }, [pair, progress]);
  const reportError = useCallback((message: string) => setError(message), []);

  useEffect(() => {
    const abort = new AbortController();
    loadBuilderRuntime(abort.signal, { releaseGeometry: "r2" }).then(({ m3 }) => {
      if (abort.signal.aborted) return;
      setEntries(m3.states);
      const initial = new URLSearchParams(location.search).get("state");
      if (initial && m3.states.some(entry => entry.stateId === initial)) setSelected(initial);
    }).catch((reason: Error) => { if (!abort.signal.aborted) { setError(reason.message); setLoading(false); } });
    return () => abort.abort();
  }, []);

  useEffect(() => {
    const entry = entries.find(value => value.stateId === selected);
    if (!entry) return;
    const token = ++request.current;
    const abort = new AbortController();
    const load = async () => {
      setLoading(true); setError(""); setPlaying(false);
      const start = performance.now();
      let endpoint = cache.current.get(entry.contentHash);
      if (!endpoint) {
        const state = await loadBuilderState(entry, abort.signal, { releaseGeometry: "r2" });
        if (abort.signal.aborted) return;
        const samples = samplesFor(state);
        const data = await buildFieldInWorker(samples, abort.signal);
        endpoint = { id: selected, data, palette: paletteFor(entry) };
        cache.current.set(entry.contentHash, endpoint);
        if (cache.current.size > 8) cache.current.delete(cache.current.keys().next().value!);
      }
      if (abort.signal.aborted || token !== request.current) return;
      const displayed = current.current;
      let source = displayed.pair?.target ?? endpoint;
      if (displayed.pair && displayed.progress < 1) {
        source = { ...displayed.pair.target, id: "Промежуточная форма", data: mixFields(displayed.pair.source.data, displayed.pair.target.data, displayed.progress) };
      }
      const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
      const animate = Boolean(displayed.pair) && !reduced;
      setPair({ source, target: endpoint }); setProgress(animate ? 0 : 1); setPlaying(animate);
      setLoadMs(Math.round(performance.now() - start)); setLoading(false);
      const url = new URL(location.href); url.searchParams.set("state", selected); history.replaceState(null, "", url);
    };
    load().catch((reason: Error) => { if (!abort.signal.aborted) { setError(reason.message); setLoading(false); } });
    return () => abort.abort();
  }, [entries, selected]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0, previous = 0, value = current.current.progress;
    const tick = (time: number) => {
      if (previous && document.visibilityState !== "hidden") {
        value = Math.min(1, value + Math.min(time - previous, 80) / 2400);
        setProgress(value);
      }
      previous = time;
      if (value < 1) raf = requestAnimationFrame(tick); else setPlaying(false);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
  const inMotion = playing && progress < 1;
  const canReplay = Boolean(pair && pair.source !== pair.target);
  const active = entries.find(entry => entry.stateId === pair?.target.id);
  const filtered = entries.filter(entry => `${stateLabel(entry)} ${entry.stateId}`.toLowerCase().includes(filter.toLowerCase()));

  return <main className={styles.lab} data-dark={dark}>
    <header className={styles.header}>
      <Link href="/" className={styles.brand}>mimicry<span>®</span></Link>
      <span className={styles.labId}>SURFACE LAB <span> / 01</span></span>
      <Link href="/" target="_blank" className={styles.original}>Исходный мимик ↗</Link>
    </header>
    <div className={styles.workspace}>
      <section className={styles.stage} data-background={mask ? "mask" : background} aria-label="Просмотр поверхности">
        <div className={styles.stageHeading}><span className={styles.kicker}>NON-LEAKY MIMIC</span><h1>Единая кожа.<br />Ни одного просвета.</h1><p>Чешуйки сходятся в общие края.<br />Оболочка остаётся непрозрачной.</p></div>
        {pair && <SurfaceCanvas view={{ ...pair, progress, dark, density, relief, zoom, mask, rotating, reset }} onError={reportError} />}
        <div className={styles.stageBottom}><span>{active ? stateLabel(active) : "Загрузка библиотеки"}</span><span>Перетащите, чтобы вращать</span></div>
        {loading && <div className={styles.loading} role="status"><span />Строим поверхность…</div>}
        {error && <div className={styles.error} role="alert">{error}<button onClick={() => location.reload()}>Повторить</button></div>}
      </section>
      <aside className={styles.panel} aria-label="Настройки эксперимента">
        <div className={styles.panelTitle}><span>Исследование поверхности</span><span className={styles.badge}>EXPERIMENT</span></div>
        <section className={styles.controlGroup}><h2>01 <span>Форма</span><small>{entries.length} состояний</small></h2>
          <div className={styles.quickStates}>
            {["master-neutral", ...competenceOrder.map(id => `single-${id}`)].map(id => <button key={id} aria-pressed={selected === id} onClick={() => setSelected(id)}>{id === "master-neutral" ? "Сфера" : competenceMeta[id.slice(7) as CompetenceId].label}</button>)}
          </div>
          <label className={styles.search}>Найти комбинацию<input type="search" value={filter} onChange={event => setFilter(event.target.value)} placeholder="Например: video, gather…" /></label>
          <label className={styles.search}>Все состояния<select aria-label="Все состояния" value={selected} onChange={event => setSelected(event.target.value)}>
            {!filtered.some(entry => entry.stateId === selected) && <option value={selected}>{selected}</option>}
            {filtered.map(entry => <option key={entry.stateId} value={entry.stateId}>{stateLabel(entry)}</option>)}
          </select></label>
          <p className={styles.finePrint}>{filtered.length} найдено · актуальная библиотека Final R2</p>
        </section>
        <section className={styles.controlGroup}><h2>02 <span>Чешуйчатая кожа</span></h2>
          <label className={styles.range}>Плотность <output>{density}</output><input type="range" min="8" max="32" step="1" value={density} onChange={event => setDensity(+event.target.value)} /></label>
          <label className={styles.range}>Рельеф <output>{Math.round(relief * 100)}%</output><input type="range" min="0" max="0.9" step="0.01" value={relief} onChange={event => setRelief(+event.target.value)} /></label>
          <div className={styles.segment}><button aria-pressed={!dark} onClick={() => setDark(false)}>Светлая</button><button aria-pressed={dark} onClick={() => setDark(true)}>Тёмная</button></div>
        </section>
        <section className={styles.controlGroup}><h2>03 <span>Проверка просветов</span></h2>
          <div className={styles.segment}>{[["plain", "Студия"], ["grid", "Шахматка"], ["contrast", "Контраст"]].map(([id, title]) => <button key={id} aria-pressed={background === id} onClick={() => { setBackground(id); setMask(false); }}>{title}</button>)}</div>
          <label className={styles.check}><input type="checkbox" checked={mask} onChange={event => setMask(event.target.checked)} />Белый силуэт на чёрном</label>
          <label className={styles.check}><input type="checkbox" checked={rotating} onChange={event => setRotating(event.target.checked)} />Вращать автоматически</label>
          <label className={styles.range}>Приближение <output>{Math.round(zoom * 100)}%</output><input type="range" min="0.7" max="1.7" step="0.01" value={zoom} onChange={event => setZoom(+event.target.value)} /></label>
          <button className={styles.reset} onClick={() => { setReset(value => value + 1); setZoom(1); }}>Сбросить ракурс ↗</button>
        </section>
        <section className={styles.controlGroup}><h2>04 <span>Переход между формами</span></h2>
          <label className={styles.range}>Положение <output>{Math.round(progress * 100)}%</output><input aria-label="Прогресс перехода" type="range" min="0" max="1" step="0.005" value={progress} disabled={!canReplay || loading} onChange={event => { setPlaying(false); setProgress(+event.target.value); }} /></label>
          <button className={styles.play} disabled={!canReplay || loading} onClick={() => { if (inMotion) setPlaying(false); else { if (progress >= 1) setProgress(0); setPlaying(true); } }}>{inMotion ? "Ⅱ Пауза" : "▷ Воспроизвести переход"}</button>
          <p className={styles.finePrint}>Выберите другую форму, чтобы проверить движение. Ползунок останавливает любой промежуточный кадр.</p>
        </section>
      </aside>
    </div>
    <footer className={styles.footer}><div><span className={styles.dot} />Непрерывная непрозрачная оболочка</div><p>Эксперимент: цельный объём + ромбический рельеф материала. Формы восстановлены из текущих точек; тонкие детали могут сглаживаться. Переход объёмный, отдельный от анимации основного сайта.</p><span>{loadMs ? `${loadMs} мс · 96³` : "96³ · VOLUME"}</span></footer>
  </main>;
}

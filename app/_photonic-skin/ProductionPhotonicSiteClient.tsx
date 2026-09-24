"use client";

import dynamic from "next/dynamic";
import ps05 from '../_ps05/ps05.module.css';

const PhotonicSiteRuntime = dynamic(
  () => import("./PhotonicSiteRuntime").then((module) => module.PhotonicSiteRuntime),
  {
    ssr: false,
    loading: () => (
      <main className={ps05.site} style={{ minHeight: '100svh', background: 'var(--mm-neutral-canvas-light)', padding: '120px 24px', color: '#181b20' }}>
        <div className={ps05.copy}><p className={ps05.eyebrow}>Mimicry group / корпоративные коммуникации</p><h1>Помогаем компаниям говорить с людьми</h1><p className={ps05.lead}>Собираем спецпроекты от смысла до запуска.</p><div className={ps05.actionRow}><a href="#screen-03.1">Собрать проект ↗</a><a href="#screen-05.1">Подключить компетенцию ↗</a></div></div>
      </main>
    ),
  },
);

export function ProductionPhotonicSiteClient() {
  return <PhotonicSiteRuntime mode="production" />;
}

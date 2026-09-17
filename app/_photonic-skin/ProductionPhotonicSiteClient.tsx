"use client";

import dynamic from "next/dynamic";

const PhotonicSiteRuntime = dynamic(
  () => import("./PhotonicSiteRuntime").then((module) => module.PhotonicSiteRuntime),
  {
    ssr: false,
    loading: () => (
      <main className="photonic-loading" aria-label="Загрузка визуальной сцены" role="status">
        <span /><span /><span />
      </main>
    ),
  },
);

export function ProductionPhotonicSiteClient() {
  return <PhotonicSiteRuntime mode="production" />;
}

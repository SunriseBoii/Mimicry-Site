"use client";

import dynamic from "next/dynamic";

const PhotonicSiteRuntime = dynamic(
  () => import("./PhotonicSiteRuntime").then((module) => module.PhotonicSiteRuntime),
  { ssr: false },
);

export function ProductionPhotonicSiteClient() {
  return <PhotonicSiteRuntime mode="production" />;
}

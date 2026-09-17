"use client";

import dynamic from "next/dynamic";

export const NonLeakyClient = dynamic(() => import("./NonLeakyLab"), {
  ssr: false,
  loading: () => <main style={{ padding: 40 }}>Загрузка Surface Lab…</main>,
});

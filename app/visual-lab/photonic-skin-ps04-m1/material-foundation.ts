export type MaterialTheme = "light" | "dark";

export type LinearRgb = readonly [number, number, number];

export interface MaterialControllerState {
  theme: MaterialTheme;
  themeMix: number;
  globalColorPhase: number;
  paletteFrom: LinearRgb;
  paletteTo: LinearRgb;
  paletteProgress: number;
  reducedMotion: boolean;
  stableVariation: boolean;
  materialNeutral: true;
}

export interface MaterialThemePreset {
  background: string;
  substrate: string;
  albedo: string;
  roughness: number;
  metalness: number;
  specular: number;
  clearcoat: number;
  clearcoatRoughness: number;
  exposure: number;
  ambientStrength: number;
  keyStrength: number;
  fillStrength: number;
  rimStrength: number;
}

export const MATERIAL_THEME_PRESETS: Record<MaterialTheme, MaterialThemePreset> = {
  light: {
    background: "#EBEBE8",
    substrate: "#E3E4E1",
    albedo: "#F2F3F0",
    roughness: 0.54,
    metalness: 0.015,
    specular: 0.34,
    clearcoat: 0.12,
    clearcoatRoughness: 0.46,
    exposure: 1.08,
    ambientStrength: 0.21,
    keyStrength: 0.89,
    fillStrength: 0.28,
    rimStrength: 0.095,
  },
  dark: {
    background: "#090B0D",
    substrate: "#1A2026",
    albedo: "#39434C",
    roughness: 0.44,
    metalness: 0.38,
    specular: 0.49,
    clearcoat: 0.055,
    clearcoatRoughness: 0.5,
    exposure: 1.1,
    ambientStrength: 0.33,
    keyStrength: 1.48,
    fillStrength: 0.9,
    rimStrength: 0.31,
  },
};

export const STABLE_VARIATION_CONTRACT = Object.freeze({
  seed: "persistent-id / uint avalanche",
  roughnessHalfRange: 0.025,
  albedoHalfRange: 0.018,
  specularHalfRange: 0.015,
  changesGeometry: false,
  changesPerFrame: false,
});

export function clampThemeMix(value: number) {
  return Math.min(1, Math.max(0, Number.isFinite(value) ? value : 0));
}

export function stableSeedForPersistentId(persistentId: number) {
  let value = persistentId >>> 0;
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d) >>> 0;
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b) >>> 0;
  value ^= value >>> 16;
  return (value & 0x00ffffff) / 0x00ffffff;
}

export function defaultMaterialController(theme: MaterialTheme): MaterialControllerState {
  return {
    theme,
    themeMix: theme === "dark" ? 1 : 0,
    globalColorPhase: 0,
    paletteFrom: [0, 0, 0],
    paletteTo: [0, 0, 0],
    paletteProgress: 0,
    reducedMotion: false,
    stableVariation: true,
    materialNeutral: true,
  };
}

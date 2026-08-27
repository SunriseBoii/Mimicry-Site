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
    background: "#F5F2EB",
    substrate: "#E9E5DC",
    albedo: "#DED9CF",
    roughness: 0.62,
    metalness: 0.02,
    specular: 0.22,
    clearcoat: 0.005,
    clearcoatRoughness: 0.72,
    exposure: 0.92,
    ambientStrength: 0.22,
    keyStrength: 0.56,
    fillStrength: 0.18,
    rimStrength: 0.055,
  },
  dark: {
    background: "#090B0D",
    substrate: "#15181B",
    albedo: "#282D31",
    roughness: 0.48,
    metalness: 0.38,
    specular: 0.42,
    clearcoat: 0.015,
    clearcoatRoughness: 0.66,
    exposure: 1.04,
    ambientStrength: 0.34,
    keyStrength: 1.42,
    fillStrength: 0.82,
    rimStrength: 0.2,
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

import {
  MATERIAL_THEME_PRESETS,
  type MaterialTheme,
} from "../photonic-skin-ps04-m1/material-foundation";
import type { PhotonicColorLayer } from "./photonic-field";
import type { PhotonicPaletteController } from "./palette-controller";

export { MATERIAL_THEME_PRESETS };
export type { MaterialTheme };

export type FieldDiagnostic = "material" | "coordinate" | "coverage" | "semantic";

export interface M2MaterialControllerState {
  theme: MaterialTheme;
  themeMix: number;
  stableVariation: boolean;
  colorEnabled: boolean;
  colorLayer: PhotonicColorLayer;
  diagnostic: FieldDiagnostic;
  reducedMotion: boolean;
  colorController: PhotonicPaletteController;
}

export function defaultM2MaterialController(
  theme: MaterialTheme,
  colorController: PhotonicPaletteController,
): M2MaterialControllerState {
  return {
    theme,
    themeMix: theme === "dark" ? 1 : 0,
    stableVariation: true,
    colorEnabled: true,
    colorLayer: "full",
    diagnostic: "material",
    reducedMotion: false,
    colorController,
  };
}

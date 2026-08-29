/**
 * M4-only screen-space fit. Applied to the whole actor via the existing
 * instanced mesh scale. Frozen M1–M3 presentation matrices stay untouched.
 *
 * Identity / GPU parity mode must keep scale === 1.
 */

export type FitProfile = "master" | "brandWide" | "complex" | "single" | "none";

export const SITE_FIT_PROFILES: Readonly<Record<FitProfile, number>> = Object.freeze({
  // MASTER already fills the square NDC target (~0.8) as a dense sphere.
  master: 1,
  // Brand-wide / gather / drive objects share the same frozen NDC target but
  // their silhouette is sparser than MASTER, so a modest whole-actor lift
  // recovers visual weight without rewriting presentationFrame.scale.
  brandWide: 1.16,
  complex: 1.14,
  // SINGLE merch/video silhouettes are the smallest frozen projected bounds.
  // 1.36 lifts merch to the 18vw machine floor; Event/Design stay inside the slot.
  single: 1.36,
  none: 1,
});

export function siteFitScaleFor(profile: FitProfile, identity: boolean) {
  if (identity || profile === "none") return 1;
  return SITE_FIT_PROFILES[profile];
}

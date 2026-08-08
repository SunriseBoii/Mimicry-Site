import assert from "node:assert/strict";
import test from "node:test";
import { competenceOrder } from "../app/_brand/color-system";
import {
  CORE_COMPETENCE_COLORS,
  getTransitionPolicy,
  resolvePhotonicPresentation,
} from "../app/_visual-actor/visual-actor-state";

test("seven competences map to the seven approved core colors", () => {
  assert.deepEqual(Object.keys(CORE_COMPETENCE_COLORS), [
    "content",
    "design",
    "event",
    "games",
    "video",
    "digital",
    "merch",
  ]);
  assert.deepEqual(CORE_COMPETENCE_COLORS, {
    content: "#4C7AFF",
    design: "#9E64EE",
    event: "#F86927",
    games: "#76A713",
    video: "#E34992",
    digital: "#009FAC",
    merch: "#D5A200",
  });
  assert.equal(competenceOrder.length, 7);
});

test("SINGLE contains no colors outside its competence", () => {
  const single = resolvePhotonicPresentation({
    kind: "single",
    competence: "video",
  });

  assert.deepEqual(single.competences, ["video"]);
  assert.deepEqual([...new Set(single.palette)], ["#E34992"]);
});

test("COMPLEX(Content, Design, Digital) contains exactly three approved colors", () => {
  const complex = resolvePhotonicPresentation({
    kind: "complex",
    competences: ["digital", "content", "design", "content"],
    morph: "convergence",
  });

  assert.deepEqual(complex.competences, ["content", "design", "digital"]);
  assert.deepEqual(complex.palette, ["#4C7AFF", "#9E64EE", "#009FAC"]);
});

test("reduced motion and a system override never morph geometry", () => {
  assert.equal(getTransitionPolicy("reduced", false).canMorphGeometry, false);
  assert.equal(getTransitionPolicy("full", true).canMorphGeometry, false);
  assert.equal(getTransitionPolicy("static", false).canMorphGeometry, false);
  assert.equal(getTransitionPolicy("full", false).canMorphGeometry, true);
});


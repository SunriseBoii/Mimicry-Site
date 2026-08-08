import assert from "node:assert/strict";
import test from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { DoubleEntry } from "../app/visual-lab/photonic-skin/DoubleEntry";

test("the double entry is present in semantic DOM", () => {
  const markup = renderToStaticMarkup(<DoubleEntry />);

  assert.match(markup, /<section[^>]+aria-labelledby=/);
  assert.match(markup, /<nav[^>]+aria-label=/);
  assert.match(markup, /<a[^>]+id="project-route"/);
  assert.match(markup, /<a[^>]+id="competence-route"/);
  assert.match(markup, /Собрать проект целиком/);
  assert.match(markup, /Подключить отдельную компетенцию/);
});


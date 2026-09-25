import test from 'node:test';
import assert from 'node:assert/strict';
import { exchangeOpacity } from '../app/_ps05/motion';

test('R2: outgoing copy is gone while its letters remain in the reading area', () => {
  const viewport = 944;
  const originalCopyBottom = 684;
  const scrollDistance = viewport * .34;
  assert.ok(originalCopyBottom - scrollDistance > 80, 'the old copy has not crossed the header');
  assert.equal(exchangeOpacity(scrollDistance / viewport, true), 0);
  assert.ok(exchangeOpacity(.15, true) > 0 && exchangeOpacity(.15, true) < 1);
});

test('R2: incoming copy enters the viewport invisible, then reaches full opacity', () => {
  const viewport = 944;
  const headingOffsetWithinSection = 160;
  const sectionDistance = viewport * .62;
  assert.ok(sectionDistance + headingOffsetWithinSection < viewport, 'new heading is already inside the viewport');
  assert.equal(exchangeOpacity(sectionDistance / viewport, false), 0);
  assert.ok(exchangeOpacity(.35, false) > 0 && exchangeOpacity(.35, false) < 1);
  assert.equal(exchangeOpacity(.12, false), 1);
});

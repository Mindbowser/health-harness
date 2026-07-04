'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { assessSlice, SLICE_LIMITS } = require('../bin/slice-size.js');

test('a thin single-behavior slice is not oversized', () => {
  const r = assessSlice({ behaviors: 1, acs: 3, diffLines: 120 });
  assert.strictEqual(r.oversized, false);
  assert.strictEqual(r.suggestSplit, false);
  assert.deepStrictEqual(r.reasons, []);
});

test('more than one user-visible behavior → oversized, split it', () => {
  const r = assessSlice({ behaviors: 3, acs: 4, diffLines: 100 });
  assert.strictEqual(r.oversized, true);
  assert.strictEqual(r.suggestSplit, true);
  assert.ok(r.reasons.some((x) => /behavior/i.test(x)));
});

test('too many acceptance criteria signals a clubbed story', () => {
  const r = assessSlice({ behaviors: 1, acs: 9, diffLines: 100 });
  assert.strictEqual(r.oversized, true);
  assert.ok(r.reasons.some((x) => /criteria|acs/i.test(x)));
});

test('a large estimated diff makes the PR unreviewable → oversized', () => {
  const r = assessSlice({ behaviors: 1, acs: 3, diffLines: 900 });
  assert.strictEqual(r.oversized, true);
  assert.ok(r.reasons.some((x) => /diff|lines|PR/i.test(x)));
});

test('unknown/absent signals are not treated as oversized (no false split)', () => {
  assert.strictEqual(assessSlice({}).oversized, false);
  assert.strictEqual(assessSlice({ acs: 5 }).oversized, false); // exactly at the limit is OK
});

test('the size heuristic is documented as constants (shown to the dev)', () => {
  assert.ok(SLICE_LIMITS.maxBehaviors >= 1);
  assert.ok(SLICE_LIMITS.maxAcs >= 1);
  assert.ok(SLICE_LIMITS.maxDiffLines >= 100);
});

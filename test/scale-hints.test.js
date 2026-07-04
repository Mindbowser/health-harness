'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { isCollectionFeature, boundaryCases, scaleTestPlan, DEFAULT_LARGE_N } = require('../bin/scale-hints.js');

test('isCollectionFeature: list/pagination/search features are collections; a cosmetic change is not', () => {
  assert.strictEqual(isCollectionFeature('Paginated list of search results'), true);
  assert.strictEqual(isCollectionFeature('Export the appointments table'), true);
  assert.strictEqual(isCollectionFeature('Change the header color'), false);
});

test('boundaryCases: empty, single, exactly a page, just over a page, and a large N', () => {
  const ns = boundaryCases(20, 1000).map((c) => c.n);
  for (const n of [0, 1, 20, 21, 1000]) assert.ok(ns.includes(n), `missing boundary ${n}`);
});

test('boundaryCases: dedupes and stays sensible when no page size is given', () => {
  const ns = boundaryCases(undefined, 500).map((c) => c.n);
  assert.ok(ns.includes(0) && ns.includes(1) && ns.includes(500));
  assert.strictEqual(new Set(ns).size, ns.length); // no duplicates
});

test('scaleTestPlan: applicable for a collection feature with the boundary cases + a documented large N', () => {
  const plan = scaleTestPlan('list of patient appointments', { pageSize: 25 });
  assert.strictEqual(plan.applicable, true);
  assert.strictEqual(plan.largeN, DEFAULT_LARGE_N);
  const ns = plan.cases.map((c) => c.n);
  assert.ok(ns.includes(25) && ns.includes(26) && ns.includes(DEFAULT_LARGE_N));
});

test('scaleTestPlan: not applicable for a non-collection feature (no scale test forced)', () => {
  assert.strictEqual(scaleTestPlan('rename the Save button', {}).applicable, false);
});

test('the default large N is documented and overridable', () => {
  assert.ok(DEFAULT_LARGE_N >= 1000);
  assert.strictEqual(scaleTestPlan('results list', { maxN: 5000 }).largeN, 5000);
});

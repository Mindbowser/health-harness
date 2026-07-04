#!/usr/bin/env node
/**
 * scale-hints.js — treat scale/volume as a first-class test dimension (MBI-96).
 *
 * Pagination broke in the real world because tests only ever exercised small lists. For any collection /
 * list / paged / search / batch feature, this produces the boundary + volume test cases to write — empty,
 * single, exactly one page, just over a page, and a realistic LARGE N — plus a documented default N when the
 * PRD doesn't specify. `/align` captures the expected/max item count; `/tdd` writes these cases.
 *
 * Pure core (isCollectionFeature / boundaryCases / scaleTestPlan) is unit-tested.
 */
'use strict';

// The default "large N" to test against when the PRD doesn't specify one (documented, overridable via maxN).
const DEFAULT_LARGE_N = 1000;

const COLLECTION_RE = /\b(list|lists|pagination|paginat\w*|page|pages|search|filter|sort|bulk|batch|feed|table|grid|results|dataset|infinite\s?scroll|export|import|scroll)\b/i;

/** Pure: does this feature deal with a collection (where scale/pagination bugs live)? */
function isCollectionFeature(text) { return COLLECTION_RE.test(String(text || '')); }

/** Pure: the boundary + volume item counts to test — empty, single, exactly a page, just over a page, large.
 * Deduped + ascending; page-boundary cases are omitted when no page size is known. */
function boundaryCases(pageSize, largeN) {
  const big = Number.isFinite(largeN) && largeN > 0 ? largeN : DEFAULT_LARGE_N;
  const cases = [
    { n: 0, name: 'empty' },
    { n: 1, name: 'single' },
  ];
  if (Number.isFinite(pageSize) && pageSize > 1) {
    cases.push({ n: pageSize, name: 'exactly one page' });
    cases.push({ n: pageSize + 1, name: 'just over one page' });
  }
  cases.push({ n: big, name: 'large volume' });
  // dedupe by n, keep ascending
  const seen = new Set();
  return cases.filter((c) => (seen.has(c.n) ? false : seen.add(c.n))).sort((a, b) => a.n - b.n);
}

/** Pure: the scale test plan for a feature description → { applicable, largeN, pageSize, cases }. */
function scaleTestPlan(text, opts) {
  const o = opts || {};
  const applicable = isCollectionFeature(text);
  const largeN = Number.isFinite(o.maxN) && o.maxN > 0 ? o.maxN : DEFAULT_LARGE_N;
  const pageSize = Number.isFinite(o.pageSize) ? o.pageSize : undefined;
  return { applicable, largeN, pageSize, cases: applicable ? boundaryCases(pageSize, largeN) : [] };
}

module.exports = { isCollectionFeature, boundaryCases, scaleTestPlan, DEFAULT_LARGE_N };

// CLI: `scale-hints.js "<feature>" [--page N] [--max N]` → the plan (JSON).
if (require.main === module) {
  const args = process.argv.slice(2);
  const num = (f) => { const i = args.indexOf(f); return i >= 0 ? Number(args[i + 1]) : undefined; };
  const text = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--page' && args[i - 1] !== '--max').join(' ');
  process.stdout.write(JSON.stringify(scaleTestPlan(text, { pageSize: num('--page'), maxN: num('--max') })));
  process.exit(0);
}

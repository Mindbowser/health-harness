'use strict';
// MBI-48 — golden tests that LOCK the correctness-critical producer inputs behind the headline metrics.
// These guard the definitions in docs/metric-definitions.md (the SoT). The producer signals are already
// correct (verified); these pin them so a refactor can't silently break what Atlas computes from.
const { test } = require('node:test');
const assert = require('node:assert');
const { ticketTransitions, dedupeTransitions } = require('../bin/usage-log.js');
const { classifyDiff } = require('../bin/slice-tests.js');

const MAP = { '1': 'indeterminate', '2': 'indeterminate', '3': 'done' }; // In Progress / In Review / Done
const h = (from, fs, to, ts, at) => ({ created: at, items: [{ field: 'status', from, fromString: fs, to, toString: ts }] });

// FASTER trap #1 — reopens create a SECOND cycle. The stream must expose every ship edge + every reopen
// edge, not just first→last, or cycle-time + escaped-defect under-count.
test('MBI-48 · FASTER: a reopen (Done→In Progress→Done) yields 2 ship edges + 1 reopen edge', () => {
  const cl = { histories: [
    h('1', 'In Progress', '3', 'Done', 't1'),
    h('3', 'Done', '1', 'In Progress', 't2'),   // reopened
    h('1', 'In Progress', '3', 'Done', 't3'),
  ] };
  const evs = ticketTransitions('MBI-X', cl, MAP);
  assert.strictEqual(evs.filter((e) => e.toCat === 'done').length, 2, 'two ship cycles');
  assert.strictEqual(evs.filter((e) => e.fromCat === 'done' && e.toCat === 'indeterminate').length, 1, 'one reopen');
});

// FASTER trap — dev-cycle vs QA-wait is derivable from status NAMES (category alone can't): the handoff
// edge (→ a review/qa-named status) is present so the consumer can split the span.
test('MBI-48 · FASTER: the review handoff is identifiable by status name (dev-cycle vs QA-wait split)', () => {
  const cl = { histories: [
    h('1', 'In Progress', '2', 'IN REVIEW', 't1'),  // dev handoff
    h('2', 'IN REVIEW', '3', 'Done', 't2'),          // review/QA wait → ship
  ] };
  const evs = ticketTransitions('MBI-X', cl, MAP);
  assert.ok(/review|qa|uat|test/i.test(evs[0].toStatus), 'handoff edge names the review/QA stage');
  assert.strictEqual(evs[1].toCat, 'done');
});

// Idempotence — re-reading a changelog must NOT double-count (cycle-time/throughput would inflate).
test('MBI-48 · idempotence: re-emitting the same transitions is a no-op (dedupe by issueKey+at)', () => {
  const cl = { histories: [h('1', 'In Progress', '3', 'Done', 't1')] };
  const all = ticketTransitions('MBI-X', cl, MAP);
  const first = dedupeTransitions(all, []);
  assert.strictEqual(first.fresh.length, 1);
  assert.strictEqual(dedupeTransitions(all, first.keys).fresh.length, 0);
});

// BETTER trap — "tested" must not be a green-gate illusion: source changed with NO test change on the
// branch is a behavior-change-without-tests, even though the gate passes. Atlas must read this, not hasTests.
test('MBI-48 · BETTER: source-only diff flags behaviorChangeNoTests; source+test does not', () => {
  const sourceOnly = classifyDiff(['bin/foo.js'], {});
  assert.strictEqual(sourceOnly.behaviorChangeNoTests, true);
  const withTest = classifyDiff(['bin/foo.js', 'test/foo.test.js'], {});
  assert.strictEqual(withTest.behaviorChangeNoTests, false);
});

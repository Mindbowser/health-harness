'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { suggestFromTimestamps, parseDuration, formatDuration, resolveOpts, roundMinutes, DEFAULTS } = require('../bin/worklog-suggest.js');

const MIN = 60 * 1000;
const t0 = Date.UTC(2026, 5, 20, 9, 0, 0); // a fixed base time (no Date.now in tests)
const at = (mins) => t0 + mins * MIN;

test('parseDuration handles Jira-style and bare-hour inputs', () => {
  assert.strictEqual(parseDuration('2h 30m'), 150);
  assert.strictEqual(parseDuration('90m'), 90);
  assert.strictEqual(parseDuration('2h'), 120);
  assert.strictEqual(parseDuration('1d 4h'), 8 * 60 + 4 * 60); // Jira day = 8h
  assert.strictEqual(parseDuration('0.5h'), 30);
  assert.strictEqual(parseDuration('3'), 180);                 // bare number = hours
  assert.strictEqual(parseDuration(45), 45);                   // number = minutes
  assert.strictEqual(parseDuration('garbage'), null);
  assert.strictEqual(parseDuration(''), null);
});

test('formatDuration renders Jira durations', () => {
  assert.strictEqual(formatDuration(135), '2h 15m');
  assert.strictEqual(formatDuration(30), '30m');
  assert.strictEqual(formatDuration(120), '2h');
  assert.strictEqual(formatDuration(0), '0m');
});

test('continuous session = lead-in + summed sub-threshold gaps', () => {
  // 4 commits 20 min apart → 3 gaps of 20m = 60m + 30m lead-in = 90m
  const times = [at(0), at(20), at(40), at(60)];
  const s = suggestFromTimestamps(times, { leadInMins: 30, idleGapMins: 90, roundToMins: 15 });
  assert.strictEqual(s.minutes, 90);
  assert.strictEqual(s.timeSpent, '1h 30m');
  assert.strictEqual(s.commits, 4);
  assert.strictEqual(s.basis, 'active-gaps');
  assert.strictEqual(s.started, new Date(at(0)).toISOString());
});

test('reports elapsed span (upper bound) alongside active (lower bound)', () => {
  // commit, 5h gap, commit → active capped to 2h, but elapsed span = lead-in 30 + 300 = 330 → 5h 30m
  const s = suggestFromTimestamps([at(0), at(300)], { leadInMins: 30, idleGapMins: 90, roundToMins: 15 });
  assert.strictEqual(s.timeSpent, '2h');        // active (default suggestion)
  assert.strictEqual(s.elapsed, '5h 30m');      // elapsed (upper-bound context)
  assert.ok(s.elapsedMinutes >= s.minutes, 'elapsed must be ≥ active');
});

test('a long idle gap is capped at the idle threshold, not summed', () => {
  // commit, 5h gap (lunch + meetings), commit → lead-in 30 + min(300,90)=90 → 120m
  const times = [at(0), at(300)];
  const s = suggestFromTimestamps(times, { leadInMins: 30, idleGapMins: 90, roundToMins: 15 });
  assert.strictEqual(s.minutes, 120); // NOT 330
  assert.strictEqual(s.timeSpent, '2h');
});

test('single commit → just the lead-in, floored to one unit', () => {
  const s = suggestFromTimestamps([at(0)], { leadInMins: 30, roundToMins: 15 });
  assert.strictEqual(s.minutes, 30);
  assert.strictEqual(s.basis, 'single-commit-leadin');
});

test('rounds to the configured unit', () => {
  // lead-in 30 + gap 25 = 55 → rounds to 60 at 15m unit
  const s = suggestFromTimestamps([at(0), at(25)], { leadInMins: 30, idleGapMins: 90, roundToMins: 15 });
  assert.strictEqual(s.minutes, 60);
});

test('caps at maxPerDay × calendar days spanned', () => {
  // many tight commits over 2 calendar days, cap 8h/day → ≤ 16h
  const times = [];
  for (let d = 0; d < 2; d++) for (let i = 0; i < 60; i++) times.push(at(d * 24 * 60 + i * 10));
  const s = suggestFromTimestamps(times, { leadInMins: 30, idleGapMins: 90, roundToMins: 15, maxPerDayMins: 480 });
  assert.ok(s.minutes <= 480 * 2, `expected ≤ 960, got ${s.minutes}`);
});

test('no commits → zero suggestion, safe', () => {
  const s = suggestFromTimestamps([], {});
  assert.strictEqual(s.minutes, 0);
  assert.strictEqual(s.started, null);
  assert.strictEqual(s.basis, 'no-commits');
});

test('resolveOpts merges string-duration config over defaults', () => {
  const o = resolveOpts({ idleGap: '1h', leadIn: '15m', roundTo: '30m', maxPerDay: '6h' });
  // MBI-104: round granularity is capped at 5m — a coarser config (30m) is clamped down, not honored.
  assert.deepStrictEqual(o, { idleGapMins: 60, leadInMins: 15, roundToMins: 5, maxPerDayMins: 360 });
  // missing keys fall back to defaults
  const d = resolveOpts({});
  assert.strictEqual(d.idleGapMins, 90);
  assert.strictEqual(d.leadInMins, 30);
});

test('MBI-104: worklog rounds to 5-minute granularity (nearest, not coarser bucketing)', () => {
  // default granularity is 5, never 15/30/60
  assert.strictEqual(DEFAULTS.roundToMins, 5);
  assert.strictEqual(resolveOpts({}).roundToMins, 5);
  assert.strictEqual(resolveOpts({ roundTo: '15m' }).roundToMins, 5);   // coarser config clamped to 5
  assert.strictEqual(resolveOpts({ roundTo: '1h' }).roundToMins, 5);
  assert.strictEqual(resolveOpts({ roundTo: '0' }).roundToMins, 5);      // bogus → default 5
  // roundMinutes rounds to nearest 5
  assert.strictEqual(roundMinutes(7, 5), 5);
  assert.strictEqual(roundMinutes(8, 5), 10);
  assert.strictEqual(roundMinutes(12, 5), 10);
  assert.strictEqual(roundMinutes(13, 5), 15);
  assert.strictEqual(roundMinutes(2, 5), 0); // below half a unit rounds to 0 (floor applied separately)
  // end-to-end: 30 lead-in + 8m gap = 38 → nearest 5 = 40
  const at = (m) => Date.parse('2026-06-01T09:00:00Z') + m * 60000;
  const s = suggestFromTimestamps([at(0), at(8)], { leadInMins: 30, idleGapMins: 90 }); // default roundTo now 5
  assert.strictEqual(s.minutes, 40);
});

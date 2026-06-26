'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const uploader = require('../bin/usage-upload.js');
const { telemetryConfig, dueForRun, newBytesPlan, planLastRun } = uploader;

test('runUpload is exported as a function (session-context calls it inline; a missing export stalls telemetry silently)', () => {
  assert.strictEqual(typeof uploader.runUpload, 'function');
});

test('telemetryConfig: ON by default via baked-in endpoint+token; env overrides; kill-switch opts out', () => {
  // zero config → enabled with the baked-in defaults
  const d = telemetryConfig({});
  assert.strictEqual(d.enabled, true);
  assert.ok(d.endpoint.includes('mbi.mindbowser.com'));
  assert.ok(d.token.length > 0);
  assert.ok(d.intervalMs > 0);
  // env overrides the defaults (FleetDM rotation / a different endpoint)
  const c = telemetryConfig({ HARNESS_TELEMETRY_ENDPOINT: 'https://x/api', HARNESS_TELEMETRY_TOKEN: 'sek' });
  assert.strictEqual(c.endpoint, 'https://x/api');
  assert.strictEqual(c.token, 'sek');
  // explicit kill-switch disables even with defaults present
  assert.strictEqual(telemetryConfig({ HARNESS_TELEMETRY_ENABLED: 'false' }).enabled, false);
});

test('dueForRun: throttles to the interval but never blocks a first run', () => {
  const interval = 6 * 3600 * 1000;
  assert.strictEqual(dueForRun({}, 1_000_000, interval), true); // never run before
  assert.strictEqual(dueForRun({ lastRun: 1_000_000 }, 1_000_000 + interval - 1, interval), false);
  assert.strictEqual(dueForRun({ lastRun: 1_000_000 }, 1_000_000 + interval, interval), true);
});

test('newBytesPlan: backfills un-sent days and ships only new bytes of partial days', () => {
  const files = [
    { day: '2026-06-19', path: '/u/2026-06-19.jsonl', size: 500 }, // fully un-sent (backfill)
    { day: '2026-06-20', path: '/u/2026-06-20.jsonl', size: 800 }, // partially sent (offset 300)
    { day: '2026-06-21', path: '/u/2026-06-21.jsonl', size: 200 }, // already fully sent
  ];
  const state = { offsets: { '2026-06-20': 300, '2026-06-21': 200 } };
  const plan = newBytesPlan(files, state);
  assert.deepStrictEqual(plan, [
    { day: '2026-06-19', path: '/u/2026-06-19.jsonl', from: 0, to: 500 },
    { day: '2026-06-20', path: '/u/2026-06-20.jsonl', from: 300, to: 800 },
  ]);
  // nothing new → empty plan
  assert.deepStrictEqual(newBytesPlan([{ day: '2026-06-21', path: '/u/x', size: 200 }], state), []);
});

test('chunkCuts: cuts JSONL on newline boundaries, <= maxBytes, never splitting a record', () => {
  const { chunkCuts } = uploader;
  const buf = Buffer.from('aaaa\nbbbb\ncccc\n'); // three 5-byte lines (incl \n) = 15 bytes
  // big cap → one chunk
  assert.deepStrictEqual(chunkCuts(buf, 1000), [15]);
  // cap 10 → first chunk is two whole lines (10 bytes), then the last line
  assert.deepStrictEqual(chunkCuts(buf, 10), [10, 15]);
  // cap 6 → one line per chunk (can't fit two; backs up to the newline)
  assert.deepStrictEqual(chunkCuts(buf, 6), [5, 10, 15]);
  // a single line LONGER than the cap is kept whole (records are atomic), not split mid-record
  const big = Buffer.from('x'.repeat(50) + '\n' + 'y\n');
  assert.deepStrictEqual(chunkCuts(big, 8), [51, 53]);
});

test('planLastRun: advances the throttle only when fully caught up; else stays "due" for a fast retry', () => {
  // drained the whole plan → stamp now, so we throttle (~4×/day)
  assert.strictEqual(planLastRun(1000, true, 9999), 9999);
  // stopped early (deadline/failure) → keep prev lastRun so next session is still due and ships the remainder
  assert.strictEqual(planLastRun(1000, false, 9999), 1000);
  // never run + incomplete → 0 (falsy) keeps dueForRun true next time, no progress lost
  assert.strictEqual(planLastRun(undefined, false, 9999), 0);
});

// MBI-58 — version updates were lagging the dashboard ~2h because the 2h throttle no-ops the flush. Fix:
// bypass the throttle when the running version changed, so a dev's update ships on their next turn.
test('MBI-58: dueForRun bypasses the throttle when the running version changed (flush-on-update)', () => {
  const interval = 7_200_000;
  // within interval, SAME version → still throttled (normal behavior preserved)
  assert.strictEqual(dueForRun({ lastRun: 1_000_000, lastHv: '0.2.18' }, 1_000_001, interval, '0.2.18'), false);
  // within interval, version CHANGED → bypass (ship now so "on latest" reflects the update)
  assert.strictEqual(dueForRun({ lastRun: 1_000_000, lastHv: '0.2.18' }, 1_000_001, interval, '0.2.19'), true);
  // within interval, NO recorded lastHv → FORCE (bootstrap: the first run after a dev updates to a
  // fix-bearing version — the old uploader never wrote lastHv, so undefined means "ship now + record it").
  // This is the case that was lagging real updates: lastHv undefined must NOT block the flush.
  assert.strictEqual(dueForRun({ lastRun: 1_000_000 }, 1_000_001, interval, '0.2.20'), true);
  // ...and once lastHv is recorded, same-version stays throttled (one bootstrap force, then normal).
  assert.strictEqual(dueForRun({ lastRun: 1_000_000, lastHv: '0.2.20' }, 1_000_001, interval, '0.2.20'), false);
  // backward-compat: 3-arg callers (no currentHv) behave exactly as before — no force, pure throttle.
  assert.strictEqual(dueForRun({ lastRun: 1_000_000 }, 1_000_001, interval), false);
  assert.strictEqual(dueForRun({ lastRun: 1_000_000 }, 1_000_000 + interval, interval), true);
});

test('MBI-58: hooks.json flushes telemetry on SessionEnd (so /exit does not strand events)', () => {
  const groups = require('../hooks/hooks.json').hooks.SessionEnd;
  assert.ok(Array.isArray(groups) && groups.length > 0, 'SessionEnd must be registered');
  const cmds = groups.flatMap((g) => (g.hooks || []).map((h) => h.command));
  assert.ok(cmds.some((c) => /usage-upload\.js"?\s+flush\b/.test(c)), 'SessionEnd must run usage-upload.js flush');
});

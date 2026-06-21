'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { telemetryConfig, dueForRun, newBytesPlan } = require('../bin/usage-upload.js');

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

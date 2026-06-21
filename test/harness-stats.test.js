'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { sparkline, bar, pct, renderDashboard } = require('../bin/harness-stats.js');

test('sparkline maps values to block glyphs (flat series → flat line)', () => {
  assert.strictEqual(sparkline([]), '');
  assert.strictEqual(sparkline([0, 0, 0]).length, 3);
  const s = sparkline([0, 5, 10]);
  assert.strictEqual(s.length, 3);
  assert.ok(s[2].codePointAt(0) >= s[0].codePointAt(0)); // rising series → non-decreasing glyphs
});

test('bar + pct render proportionally', () => {
  assert.strictEqual(bar(0, 10, 10), '░'.repeat(10));
  assert.strictEqual(bar(10, 10, 10), '█'.repeat(10));
  assert.strictEqual(pct(0.5), '50%');
  assert.strictEqual(pct(null), '—');
});

test('renderDashboard shows the range, key dimensions, and the motivational summary', () => {
  const byDay = [
    { day: '2026-06-19', m: { sessions: 2, edits: 4, gateRuns: 3, gatePass: 3, commands: {}, commits: 1, prompts: 3, promptsCtx: 2, compactions: 0, objections: 1, wallDeny: 0 } },
    { day: '2026-06-20', m: { sessions: 1, edits: 6, gateRuns: 4, gatePass: 3, commands: { align: 1 }, commits: 2, prompts: 4, promptsCtx: 3, compactions: 1, objections: 0, wallDeny: 0 } },
  ];
  const out = renderDashboard({ rangeLabel: 'last 7 days', byDay, coach: '📊 Harness — last week\n🔥 Wins: gate ran 7×.' });
  assert.match(out, /last 7 days/);
  assert.match(out, /Feedback loop|gate/i);
  assert.match(out, /align/i);
  assert.match(out, /🔥 Wins/); // the motivational coaching summary is embedded when provided
});

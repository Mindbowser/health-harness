'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { coachCadence, summarize, buildCoaching } = require('../bin/usage-coach.js');

// find a real Monday + the next day (TZ-robust: uses local getDay like the impl)
function mondayAndTuesday() {
  const mon = new Date(2026, 5, 1, 12, 0, 0);
  while (mon.getDay() !== 1) mon.setDate(mon.getDate() + 1);
  const tue = new Date(mon); tue.setDate(mon.getDate() + 1);
  return { mon, tue };
}

test('cadence: daily fires once per day; weekly fires first Monday session', () => {
  const { mon, tue } = mondayAndTuesday();
  // fresh state on a Monday → weekly
  assert.strictEqual(coachCadence(mon, {}).kind, 'weekly');
  // already did weekly this week, same Monday → daily not yet done that day → daily
  const wk = coachCadence(mon, {}).week, day = coachCadence(mon, {}).day;
  assert.strictEqual(coachCadence(mon, { lastWeekly: wk }).kind, 'daily');
  // did daily today already → nothing
  assert.strictEqual(coachCadence(mon, { lastWeekly: wk, lastDaily: day }).kind, null);
  // Tuesday, fresh → daily
  assert.strictEqual(coachCadence(tue, {}).kind, 'daily');
  // Tuesday already coached today → nothing
  assert.strictEqual(coachCadence(tue, { lastDaily: coachCadence(tue, {}).day }).kind, null);
});

test('summarize aggregates events', () => {
  const recs = [
    { event: 'session_start' }, { event: 'edit', ext: 'ts' }, { event: 'edit', ext: 'ts' },
    { event: 'gate_run', result: 'pass' }, { event: 'gate_run', result: 'fail' },
    { event: 'command', name: 'align' }, { event: 'wall', action: 'deny' },
    { event: 'revert' }, { event: 'correction' },
  ];
  const m = summarize(recs);
  assert.strictEqual(m.sessions, 1);
  assert.strictEqual(m.edits, 2);
  assert.strictEqual(m.gateRuns, 2);
  assert.strictEqual(m.gatePass, 1);
  assert.strictEqual(m.commands.align, 1);
  assert.strictEqual(m.wallDeny, 1);
  assert.strictEqual(m.objections, 2); // revert + correction
});

test('summarize aggregates prompt quality and smart-zone events', () => {
  const m = summarize([
    { event: 'prompt', lenBucket: 's', hasContext: false },
    { event: 'prompt', lenBucket: 'm', hasContext: true },
    { event: 'compaction' }, { event: 'compaction' },
    { event: 'commit', sizeBucket: 's', branchKind: 'feature' },
  ]);
  assert.strictEqual(m.prompts, 2);
  assert.strictEqual(m.promptsCtx, 1);
  assert.strictEqual(m.compactions, 2);
  assert.strictEqual(m.commits, 1);
});

test('summarize counts hygiene signals; buildCoaching surfaces them (non-punitive)', () => {
  const m = summarize([
    { event: 'breaking_change', confirmed: true }, { event: 'migration_gap', reason: 'no-orm' },
    { event: 'coverage_drop', delta: 4 }, { event: 'dep_hygiene', kind: 'stale' },
  ]);
  assert.strictEqual(m.breakingChanges, 1);
  assert.strictEqual(m.migrationGaps, 1);
  assert.strictEqual(m.coverageDrops, 1);
  assert.strictEqual(m.depFlags, 1);
  const out = buildCoaching(m, 'daily');
  assert.match(out, /🧹 Hygiene/);
  assert.match(out, /migration layer/i);
});

test('buildCoaching: thin-context prompts and context bloat produce tips', () => {
  const thin = buildCoaching({ edits: 0, gateRuns: 0, gatePass: 0, commands: {}, wallDeny: 0, objections: 0,
    prompts: 8, promptsCtx: 1, compactions: 0 }, 'daily');
  assert.match(thin, /context/i);
  const bloat = buildCoaching({ edits: 0, gateRuns: 0, gatePass: 0, commands: {}, wallDeny: 0, objections: 0,
    prompts: 0, promptsCtx: 0, compactions: 4 }, 'daily');
  assert.match(bloat, /smart zone|clear/i);
});

test('buildCoaching: motivational — leads with a win, ONE pointed lever, governance, encouragement', () => {
  const loose = buildCoaching({ edits: 12, gateRuns: 1, gatePass: 1, commands: {}, wallDeny: 1, objections: 0 }, 'daily');
  assert.match(loose, /^📊 MB Harness — yesterday/);
  assert.match(loose, /gate/i);            // the lever names the feedback loop
  assert.match(loose, /branch/i);          // governance note (blocked action → branch + PR)
  assert.match(loose, /10x|lever|keep going|strong|nice|💪|🎯/i); // motivational framing, not just criticism

  const good = buildCoaching({ edits: 5, gateRuns: 4, gatePass: 4, commands: { align: 2 }, wallDeny: 0, objections: 3 }, 'weekly');
  assert.match(good, /🔥|Wins|Strong/i);   // celebrates wins
  assert.match(good, /^📊 MB Harness — last week/);

  // nothing happened at all → empty string (never nag on a no-activity day)
  assert.strictEqual(buildCoaching({ edits: 0, gateRuns: 0, gatePass: 0, commands: {}, wallDeny: 0, objections: 0 }, 'daily'), '');
});

test('buildCoaching: shows improvement vs the prior period (positive reinforcement)', () => {
  const cur = { edits: 5, gateRuns: 4, gatePass: 4, commands: { align: 2 }, wallDeny: 0, objections: 2, prompts: 5, promptsCtx: 4, compactions: 0, commits: 3 };
  const prev = { edits: 10, gateRuns: 4, gatePass: 2, commands: { align: 0 }, wallDeny: 0, objections: 0, prompts: 5, promptsCtx: 1, compactions: 0, commits: 0 };
  const out = buildCoaching(cur, 'weekly', prev);
  assert.match(out, /📈|improv|up from|→/i); // surfaces an improvement delta
});

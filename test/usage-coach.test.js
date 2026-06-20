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
  assert.strictEqual(m.objections, 2);
});

test('buildCoaching: loose loop + rubber-stamping + governance produce tips; quiet day → empty', () => {
  const loose = buildCoaching({ edits: 12, gateRuns: 1, gatePass: 1, commands: {}, wallDeny: 1, objections: 0 }, 'daily');
  assert.match(loose, /Tighten the loop/);
  assert.match(loose, /rubber-stamp/);
  assert.match(loose, /blocked action/);
  assert.match(loose, /^📊 Harness — yesterday/);

  const good = buildCoaching({ edits: 5, gateRuns: 4, gatePass: 4, commands: { align: 2 }, wallDeny: 0, objections: 3 }, 'weekly');
  assert.match(good, /Strong:/);
  assert.match(good, /^📊 Harness — last week/);

  // nothing notable → empty string (no nag)
  assert.strictEqual(buildCoaching({ edits: 0, gateRuns: 0, gatePass: 0, commands: {}, wallDeny: 0, objections: 0 }, 'daily'), '');
});

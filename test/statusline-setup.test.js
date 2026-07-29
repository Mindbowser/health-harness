'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  statuslineStatus, withStatusline, enablementNudge, wrapperCommand,
} = require('../bin/statusline-setup.js');

test('[MBI-139 AC-1] statuslineStatus: disabled / enabled / conflict', () => {
  assert.equal(statuslineStatus({}), 'disabled');
  assert.equal(statuslineStatus({ statusLine: {} }), 'disabled');
  assert.equal(statuslineStatus({ statusLine: { command: '/home/u/.claude/health-harness-statusline.sh' } }), 'enabled');
  // a different, user-owned statusline → conflict (must not be clobbered)
  assert.equal(statuslineStatus({ statusLine: { command: 'starship prompt' } }), 'conflict');
});

test('[MBI-139 AC-2] withStatusline: sets ours when absent, no-op when ours, refuses to clobber a conflict', () => {
  const cmd = wrapperCommand('/home/u');
  // absent → enabled, and OTHER keys preserved
  const a = withStatusline({ model: 'opus', env: { X: 1 } }, cmd);
  assert.equal(a.result, 'enabled');
  assert.equal(a.settings.statusLine.command, cmd);
  assert.equal(a.settings.model, 'opus');           // preserved
  assert.deepEqual(a.settings.env, { X: 1 });        // preserved
  // already ours → 'already', unchanged
  const b = withStatusline({ statusLine: { type: 'command', command: cmd } }, cmd);
  assert.equal(b.result, 'already');
  // a foreign statusLine → 'conflict', NOT overwritten
  const c = withStatusline({ statusLine: { command: 'starship prompt' } }, cmd);
  assert.equal(c.result, 'conflict');
  assert.equal(c.settings.statusLine.command, 'starship prompt');   // untouched
});

test('[MBI-139 AC-4] enablementNudge: only when disabled + onboarded; louder with open questions; silent otherwise', () => {
  // enabled → no nudge
  assert.equal(enablementNudge({ status: 'enabled', onboarded: true, openCount: 3 }), null);
  // conflict (user has their own) → no nudge (don't pester)
  assert.equal(enablementNudge({ status: 'conflict', onboarded: true, openCount: 0 }), null);
  // not onboarded → no nudge
  assert.equal(enablementNudge({ status: 'disabled', onboarded: false, openCount: 0 }), null);
  // disabled + onboarded, nothing open → soft nudge
  const soft = enablementNudge({ status: 'disabled', onboarded: true, openCount: 0 });
  assert.match(soft, /statusline/i);
  assert.match(soft, /\/start/);
  // disabled + onboarded WITH open questions → louder, mentions the count
  const loud = enablementNudge({ status: 'disabled', onboarded: true, openCount: 2 });
  assert.match(loud, /2/);
  assert.match(loud, /open question/i);
});

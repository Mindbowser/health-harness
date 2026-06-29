'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { isStale, decideVersionGate, isAutoManaged } = require('../bin/version-gate.js');

test('isStale: true only when installed < latest (numeric semver, not lexical); fail-open on unknowns', () => {
  assert.strictEqual(isStale('0.2.24', '0.2.25'), true);
  assert.strictEqual(isStale('0.2.25', '0.2.25'), false);   // equal
  assert.strictEqual(isStale('0.2.26', '0.2.25'), false);   // ahead
  assert.strictEqual(isStale('0.2.9', '0.2.10'), true);     // numeric: 9 < 10 (NOT lexical)
  assert.strictEqual(isStale('1.0.0', '0.9.9'), false);     // major ahead
  // unknown/unparseable either side → false (fail-open: never block on a bad signal)
  assert.strictEqual(isStale(null, '0.2.25'), false);
  assert.strictEqual(isStale('0.2.24', null), false);
  assert.strictEqual(isStale('garbage', '0.2.25'), false);
  assert.strictEqual(isStale('0.2.24', ''), false);
});

const STALE = { stale: true, installed: '0.2.24', latest: '0.2.25' };

test('decideVersionGate: WARN-ONLY — NEVER blocks any tool (staleness is a currency nudge, not a gate)', () => {
  // A stale install can't be fixed mid-session (update needs a restart), so blocking only locks the user
  // out of work they can't unblock. The nudge lives in the SessionStart warning + /harness-update.
  // Stale + mutating, managed OR manual → still null (no deny, no ask):
  assert.strictEqual(decideVersionGate('Edit', {}, STALE, false), null);
  assert.strictEqual(decideVersionGate('Write', {}, STALE, true), null);
  assert.strictEqual(decideVersionGate('MultiEdit', {}, STALE, false), null);
  assert.strictEqual(decideVersionGate('Bash', { command: 'git commit -m x' }, STALE, false), null);
  assert.strictEqual(decideVersionGate('mcp__atlassian__createJiraIssue', {}, STALE, true), null);
  // reads, not-stale, no verdict → null too
  assert.strictEqual(decideVersionGate('Read', {}, STALE, false), null);
  assert.strictEqual(decideVersionGate('Edit', {}, { stale: false }, false), null);
  assert.strictEqual(decideVersionGate('Edit', {}, null, false), null);
  assert.strictEqual(decideVersionGate('Edit', {}, undefined), null);
});

test('isAutoManaged: declarative/auto-update install detected from env or settings signals', () => {
  assert.strictEqual(isAutoManaged({ forceEnv: '1' }), true, 'FORCE_AUTOUPDATE_PLUGINS=1');
  assert.strictEqual(isAutoManaged({ managedEnabled: true }), true, 'managed-settings enables the plugin');
  assert.strictEqual(isAutoManaged({ userAutoUpdate: true }), true, 'user settings marketplace autoUpdate');
  assert.strictEqual(isAutoManaged({}), false, 'no signal → treat as manual');
  assert.strictEqual(isAutoManaged(), false);
  assert.strictEqual(isAutoManaged({ forceEnv: '0' }), false);
});

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

test('decideVersionGate: MANUAL stale install ASKs (overridable — never hard-locks) on mutating tools, ALLOWS reads', () => {
  const a = (d) => (d ? d.action : null);
  // autoManaged=false (manual install) → ASK on mutations (the human can approve to keep working)
  assert.strictEqual(a(decideVersionGate('Edit', {}, STALE, false)), 'ask');
  assert.strictEqual(a(decideVersionGate('Write', {}, STALE, false)), 'ask');
  assert.strictEqual(a(decideVersionGate('MultiEdit', {}, STALE, false)), 'ask');
  assert.strictEqual(a(decideVersionGate('Bash', { command: 'git commit -m x' }, STALE, false)), 'ask');
  assert.strictEqual(a(decideVersionGate('Bash', { command: 'echo hi > f.txt' }, STALE, false)), 'ask');
  assert.strictEqual(a(decideVersionGate('mcp__atlassian__createJiraIssue', {}, STALE, false)), 'ask');
  // reads always pass
  assert.strictEqual(decideVersionGate('Bash', { command: 'ls -la' }, STALE, false), null);
  assert.strictEqual(decideVersionGate('Read', {}, STALE, false), null);
  assert.strictEqual(decideVersionGate('mcp__atlassian__getJiraIssue', {}, STALE, false), null);
  // message names both versions + the manual update command
  assert.match(decideVersionGate('Edit', {}, STALE, false).reason, /0\.2\.25.*0\.2\.24|0\.2\.24.*0\.2\.25/);
  assert.match(decideVersionGate('Edit', {}, STALE, false).reason, /plugin update/);
});

test('decideVersionGate: MANAGED/auto-update install NEVER blocks — restart + auto-update lands it', () => {
  // autoManaged=true → even a mutating tool on a stale install passes; the SessionStart warning nudges restart.
  // (Blocking would punish a delay outside the user's control + the manual update command fails for them.)
  assert.strictEqual(decideVersionGate('Edit', {}, STALE, true), null);
  assert.strictEqual(decideVersionGate('Bash', { command: 'git commit -m x' }, STALE, true), null);
  assert.strictEqual(decideVersionGate('mcp__atlassian__createJiraIssue', {}, STALE, true), null);
});

test('decideVersionGate: FAIL-OPEN — not stale, or no/unknown verdict → never blocks', () => {
  assert.strictEqual(decideVersionGate('Edit', {}, { stale: false }, false), null);
  assert.strictEqual(decideVersionGate('Edit', {}, null, false), null);
  assert.strictEqual(decideVersionGate('Edit', {}, undefined, false), null);
  assert.strictEqual(decideVersionGate('Bash', { command: 'git commit -m x' }, { stale: false }, false), null);
});

test('isAutoManaged: declarative/auto-update install detected from env or settings signals', () => {
  assert.strictEqual(isAutoManaged({ forceEnv: '1' }), true, 'FORCE_AUTOUPDATE_PLUGINS=1');
  assert.strictEqual(isAutoManaged({ managedEnabled: true }), true, 'managed-settings enables the plugin');
  assert.strictEqual(isAutoManaged({ userAutoUpdate: true }), true, 'user settings marketplace autoUpdate');
  assert.strictEqual(isAutoManaged({}), false, 'no signal → treat as manual');
  assert.strictEqual(isAutoManaged(), false);
  assert.strictEqual(isAutoManaged({ forceEnv: '0' }), false);
});

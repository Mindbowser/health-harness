'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { isStale, decideVersionGate } = require('../bin/version-gate.js');

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

test('decideVersionGate: stale install DENYs mutating tools, ALLOWS reads', () => {
  const a = (d) => (d ? d.action : null);
  // file mutations → DENY
  assert.strictEqual(a(decideVersionGate('Edit', {}, STALE)), 'deny');
  assert.strictEqual(a(decideVersionGate('Write', {}, STALE)), 'deny');
  assert.strictEqual(a(decideVersionGate('MultiEdit', {}, STALE)), 'deny');
  // mutating Bash → DENY; read Bash → allow
  assert.strictEqual(a(decideVersionGate('Bash', { command: 'git commit -m x' }, STALE)), 'deny');
  assert.strictEqual(a(decideVersionGate('Bash', { command: 'echo hi > f.txt' }, STALE)), 'deny');
  assert.strictEqual(decideVersionGate('Bash', { command: 'ls -la' }, STALE), null);
  assert.strictEqual(decideVersionGate('Bash', { command: 'git status' }, STALE), null);
  // MCP write → DENY; MCP read → allow
  assert.strictEqual(a(decideVersionGate('mcp__atlassian__createJiraIssue', {}, STALE)), 'deny');
  assert.strictEqual(decideVersionGate('mcp__atlassian__getJiraIssue', {}, STALE), null);
  // pure read tools → allow
  assert.strictEqual(decideVersionGate('Read', {}, STALE), null);
  assert.strictEqual(decideVersionGate('Grep', {}, STALE), null);
  // the deny names the update command + both versions
  assert.match(decideVersionGate('Edit', {}, STALE).reason, /0\.2\.25.*0\.2\.24|0\.2\.24.*0\.2\.25/);
  assert.match(decideVersionGate('Edit', {}, STALE).reason, /plugin update/);
});

test('decideVersionGate: FAIL-OPEN — not stale, or no/unknown verdict → never blocks', () => {
  assert.strictEqual(decideVersionGate('Edit', {}, { stale: false }), null);
  assert.strictEqual(decideVersionGate('Edit', {}, null), null);
  assert.strictEqual(decideVersionGate('Edit', {}, undefined), null);
  assert.strictEqual(decideVersionGate('Bash', { command: 'git commit -m x' }, { stale: false }), null);
});

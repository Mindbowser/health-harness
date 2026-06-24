'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const GE = require('../bin/gate-evidence.js');
const { decideGateEvidence } = require('../hooks/outward-guard.js');
const action = (d) => (d ? d.action : null);

test('evidenceState: no-gate dominates; gate present → verified iff a passing run exists', () => {
  assert.strictEqual(GE.evidenceState(false, false), 'no-gate');
  assert.strictEqual(GE.evidenceState(false, true), 'no-gate');   // no gate wins
  assert.strictEqual(GE.evidenceState(true, false), 'unverified');
  assert.strictEqual(GE.evidenceState(true, true), 'verified');
});

test('record/hasPassFor: a PASS is found by sha; a FAIL or unknown sha is not; re-running green flips it', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-gate-'));
  GE.record(cwd, 'sha-aaa', 'pass');
  GE.record(cwd, 'sha-bbb', 'fail');
  assert.strictEqual(GE.hasPassFor(cwd, 'sha-aaa'), true);
  assert.strictEqual(GE.hasPassFor(cwd, 'sha-bbb'), false);  // a failed run is NOT a pass
  assert.strictEqual(GE.hasPassFor(cwd, 'sha-zzz'), false);  // never ran
  GE.record(cwd, 'sha-bbb', 'pass');                          // fixed + re-ran green
  assert.strictEqual(GE.hasPassFor(cwd, 'sha-bbb'), true);
});

test('decideGateEvidence: only on push; verified → silent; unverified/no-gate → ASK with the right reason', () => {
  assert.strictEqual(decideGateEvidence('npm test', '/x', { state: 'unverified' }), null); // not a push
  assert.strictEqual(decideGateEvidence('git status', '/x', { state: 'unverified' }), null);
  assert.strictEqual(decideGateEvidence('git push origin feat/x', '/x', { state: 'verified' }), null); // proof exists → no prompt
  const unver = decideGateEvidence('git push origin feat/x', '/x', { state: 'unverified', sha: 'deadbeef0000' });
  assert.strictEqual(action(unver), 'ask');
  assert.ok(/no captured PASSING/.test(unver.reason) && /deadbeef0000/.test(unver.reason));
  const nogate = decideGateEvidence('git push origin feat/x', '/x', { state: 'no-gate' });
  assert.strictEqual(action(nogate), 'ask');
  assert.ok(/no automated gate/.test(nogate.reason));
});

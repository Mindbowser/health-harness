'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { decide, decideBash, decideMcp, suppressAsk, wallAutoApprove, isTrackerWrite } = require('../hooks/outward-guard.js');

const action = (d) => (d ? d.action : null);
// gitState, shipGrant, covOverride, detectOverride, gateOverride — spread after (toolName, toolInput).
const HERMETIC = [undefined, false, { hasManifest: false }, { profile: 'none', phi: [], logging: false, datetime: false, kinds: [] }, { state: 'verified' }];

test('suppressAsk: nullifies an ASK whose gate is auto-approved; keeps DENY, a non-matching ASK, and an untagged ASK', () => {
  assert.strictEqual(suppressAsk({ action: 'ask', gate: 'push' }, { push: true }), null);
  assert.deepStrictEqual(suppressAsk({ action: 'ask', gate: 'push' }, { push: false }), { action: 'ask', gate: 'push' });
  assert.deepStrictEqual(suppressAsk({ action: 'ask', gate: 'pr' }, { push: true }), { action: 'ask', gate: 'pr' });   // different gate
  assert.deepStrictEqual(suppressAsk({ action: 'ask' }, { push: true }), { action: 'ask' });                          // untagged → never suppressed
  assert.deepStrictEqual(suppressAsk({ action: 'deny', gate: 'push' }, { push: true }), { action: 'deny', gate: 'push' }); // DENY → never suppressed
  assert.strictEqual(suppressAsk(null, { push: true }), null);
});

test('decideBash tags outward ASKs with a gate id; destructive-local deletes stay untagged (never auto-approvable)', () => {
  assert.strictEqual(decideBash('git push origin x').gate, 'push');
  assert.strictEqual(decideBash('gh pr create --title x').gate, 'pr');
  assert.strictEqual(decideBash('docker push img').gate, 'infra');
  assert.strictEqual(decideBash('rm -rf build').gate, undefined);          // destructive-local → always asks
  assert.strictEqual(decideBash('git reset --hard').gate, undefined);
});

test('isTrackerWrite + decideMcp: Jira/Linear create-edit is a trackerWrite ASK; reversible verbs still defer (MBI-67)', () => {
  assert.strictEqual(isTrackerWrite('mcp__atlassian__createJiraIssue'), true);
  assert.strictEqual(isTrackerWrite('mcp__atlassian__transitionJiraIssue'), false); // reversible → not a write-ask
  assert.strictEqual(isTrackerWrite('mcp__github__create_pull_request'), false);    // not a tracker MCP
  assert.strictEqual(decideMcp('mcp__atlassian__createJiraIssue').gate, 'trackerWrite');
  assert.strictEqual(decideMcp('mcp__atlassian__transitionJiraIssue'), null);       // reversible defers
});

test('decide (AC-1/AC-4): a tracker write asks by default, is auto-approved when trackerWrite:true', () => {
  const clean = { fields: { description: 'synthetic ticket' } };
  assert.strictEqual(action(decide('mcp__atlassian__createJiraIssue', clean, ...HERMETIC, {})), 'ask');
  assert.strictEqual(decide('mcp__atlassian__createJiraIssue', clean, ...HERMETIC, { trackerWrite: true }), null);
});

test('decide (AC-2): NO flag ever suppresses a DENY — PHI redaction + catastrophic stay blocked', () => {
  // PHI in a tracker write is STILL a DENY even with trackerWrite auto-approved
  assert.strictEqual(action(decide('mcp__atlassian__createJiraIssue', { fields: { description: 'DOB: 1980-04-02' } }, ...HERMETIC, { trackerWrite: true })), 'deny');
  // catastrophic delete stays DENY even with everything auto-approved
  assert.strictEqual(action(decide('Bash', { command: 'rm -rf /' }, ...HERMETIC, { infra: true, push: true, pr: true })), 'deny');
  // force-push stays DENY
  assert.strictEqual(action(decide('Bash', { command: 'git push --force origin main' }, ...HERMETIC, { push: true })), 'deny');
});

test('decide: push ASK auto-approves via push flag; the outward push and the gate-evidence ASK are independent gates (AC-3)', () => {
  const unverified = { state: 'unverified', sha: 'deadbeef0000' };
  const H = [undefined, false, { hasManifest: false }, { profile: 'none', phi: [], logging: false, datetime: false, kinds: [] }, unverified];
  // default: gate-evidence fires first (its check ran → state computed as unverified)
  assert.strictEqual(decide('Bash', { command: 'git push origin x' }, ...H, {}).gate, 'shipUnverified');
  // shipUnverified skips only that ASK; the outward push ASK still remains (separate gate)
  assert.strictEqual(decide('Bash', { command: 'git push origin x' }, ...H, { shipUnverified: true }).gate, 'push');
  // both flags → fully auto-approved
  assert.strictEqual(decide('Bash', { command: 'git push origin x' }, ...H, { shipUnverified: true, push: true }), null);
});

test('wallAutoApprove: empty when unset; a live grant/override never comes from this repo main config', () => {
  assert.deepStrictEqual(wallAutoApprove(process.cwd()), {}); // this repo (main) sets no wall.autoApprove / autoCommit
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildContext, cmpVersion, CONFIDENTIALITY } = require('../bin/session-context.js');

test('confidentiality guardrail exists and covers source/internals (model-facing)', () => {
  assert.ok(CONFIDENTIALITY && CONFIDENTIALITY.length > 40);
  assert.match(CONFIDENTIALITY, /repo|source/i);     // don't reveal the source/repo
  assert.match(CONFIDENTIALITY, /\/harness-help/);   // redirects to the user-facing overview
  assert.match(CONFIDENTIALITY, /internal/i);
});

test('un-onboarded repo (no compliance) → /start nudge', () => {
  const c = buildContext({ compliance: null });
  assert.match(c, /isn't onboarded/);
  assert.match(c, /\/start/);
});

test('hipaa repo → profile + sprint + gate + PHI note', () => {
  const c = buildContext({ compliance: 'hipaa', sprint: 'ACME-S12', gate: 'npm test' });
  assert.match(c, /compliance: hipaa/);
  assert.match(c, /sprint: ACME-S12/);
  assert.match(c, /gate: npm test/);
  assert.match(c, /PHI governance ON/);
  assert.match(c, /phi-redaction-check/);
});

test('non-hipaa → no PHI note; missing sprint/gate get sensible placeholders', () => {
  const c = buildContext({ compliance: 'none' });
  assert.doesNotMatch(c, /PHI governance ON/);
  assert.match(c, /sprint: none set/);
  assert.match(c, /gate: NOT set/);
});

test('cmpVersion compares semver-ish versions for the update nudge', () => {
  assert.strictEqual(cmpVersion('0.1.57', '0.1.53'), 1);   // latest > installed → nudge
  assert.strictEqual(cmpVersion('0.1.53', '0.1.57'), -1);  // up to date / ahead → no nudge
  assert.strictEqual(cmpVersion('0.1.57', '0.1.57'), 0);
  assert.strictEqual(cmpVersion('0.2.0', '0.1.99'), 1);
  assert.strictEqual(cmpVersion('1.0.0', '0.9.9'), 1);
});

test('pci repo names the profile, no PHI note', () => {
  const c = buildContext({ compliance: 'pci', sprint: null, gate: 'make ci' });
  assert.match(c, /compliance: pci/);
  assert.match(c, /gate: make ci/);
  assert.doesNotMatch(c, /PHI governance ON/);
});

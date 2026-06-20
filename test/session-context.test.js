'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildContext } = require('../bin/session-context.js');

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

test('pci repo names the profile, no PHI note', () => {
  const c = buildContext({ compliance: 'pci', sprint: null, gate: 'make ci' });
  assert.match(c, /compliance: pci/);
  assert.match(c, /gate: make ci/);
  assert.doesNotMatch(c, /PHI governance ON/);
});

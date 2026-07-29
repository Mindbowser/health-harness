'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { buildContext, cmpVersion, CONFIDENTIALITY, harnessConfigDir, wallConfigNotice } = require('../bin/session-context.js');

test('MBI-130: harnessConfigDir walks up to the repo root from a subdirectory', () => {
  const fs = require('fs'), path = require('path'), os = require('os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-walkup-'));
  fs.mkdirSync(path.join(root, '.health-harness'), { recursive: true });
  fs.writeFileSync(path.join(root, '.health-harness', 'project.json'), '{}');
  const deep = path.join(root, 'a', 'b', 'c');
  fs.mkdirSync(deep, { recursive: true });
  assert.equal(harnessConfigDir(deep), path.join(root, '.health-harness'));

  const orphan = fs.mkdtempSync(path.join(os.tmpdir(), 'sc-none-'));
  assert.equal(harnessConfigDir(orphan), null);
});

test('MBI-137: openQuestionsLine shows the count when >0, nothing at 0', () => {
  const { openQuestionsLine } = require('../bin/session-context.js');
  assert.equal(openQuestionsLine(0), null);
  assert.equal(openQuestionsLine(null), null);
  const l = openQuestionsLine(2);
  assert.match(l, /2/);
  assert.match(l, /open question/i);
});

test('MBI-130: wallConfigNotice warns (visibly) only when no project.json was found', () => {
  assert.equal(wallConfigNotice(false), null);                 // config present → no notice
  const n = wallConfigNotice(true);                            // no config found → one-line notice
  assert.match(n, /default/i);
  assert.match(n, /wall/i);
});

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

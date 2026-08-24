'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { inferBranchPattern, detectCommitlintMismatch } = require('../bin/git-config.js');

test('inferBranchPattern: consistent prefix across existing branches is adopted (no confirm)', () => {
  const r = inferBranchPattern(['feature/ABC-1-login', 'feature/ABC-2-logout', 'main'], 'ABC');
  assert.strictEqual(r.prefix, 'feature');
  assert.strictEqual(r.pattern, 'feature/<KEY>-<slug>');
  assert.strictEqual(r.needsConfirm, false);
});

test('inferBranchPattern: a non-default but consistent prefix (feat/) is adopted verbatim', () => {
  const r = inferBranchPattern(['feat/migrate-app', 'feat/split-web', 'main', 'develop'], 'HTX');
  assert.strictEqual(r.prefix, 'feat');
  assert.strictEqual(r.pattern, 'feat/<KEY>-<slug>');
  assert.strictEqual(r.needsConfirm, false);            // prefix is clear even though old branches carry no key
});

test('inferBranchPattern: inconsistent prefixes fall back to the default and ask', () => {
  const r = inferBranchPattern(['feature/ABC-1', 'bugfix/ABC-2', 'hotfix/ABC-3'], 'ABC');
  assert.strictEqual(r.pattern, 'feature/<KEY>-<slug>');
  assert.strictEqual(r.needsConfirm, true);
});

test('inferBranchPattern: no feature branches (only bases) → default + confirm', () => {
  const r = inferBranchPattern(['main', 'master'], 'ABC');
  assert.strictEqual(r.pattern, 'feature/<KEY>-<slug>');
  assert.strictEqual(r.needsConfirm, true);
});

test('detectCommitlintMismatch: issuePrefixes that cannot match the key is flagged', () => {
  const r = detectCommitlintMismatch({ issuePrefixes: ['JIRA-'] }, 'HTX');
  assert.strictEqual(r.mismatch, true);
  assert.deepStrictEqual(r.configured, ['JIRA-']);
  assert.strictEqual(r.expected, 'HTX-');
});

test('detectCommitlintMismatch: a matching prefix (any case) is not flagged', () => {
  assert.strictEqual(detectCommitlintMismatch({ issuePrefixes: ['htx-'] }, 'HTX').mismatch, false);
  assert.strictEqual(detectCommitlintMismatch({ issuePrefixes: ['ABC-', 'HTX-'] }, 'HTX').mismatch, false);
});

test('detectCommitlintMismatch: no commitlint config / no issuePrefixes → null (nothing to check)', () => {
  assert.strictEqual(detectCommitlintMismatch(null, 'HTX'), null);
  assert.strictEqual(detectCommitlintMismatch({}, 'HTX'), null);
  assert.strictEqual(detectCommitlintMismatch({ issuePrefixes: [] }, 'HTX'), null);
});

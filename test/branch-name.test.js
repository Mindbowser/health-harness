'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { recommend, conforms, slugify } = require('../bin/branch-name.js');

test('recommend: default prefixes match the MB convention (feature/ + fix/)', () => {
  assert.strictEqual(recommend('Story', 'ABC-12', 'add login'), 'feature/ABC-12-add-login');
  assert.strictEqual(recommend('Bug', 'ABC-13', 'fix crash'), 'fix/ABC-13-fix-crash');   // MB uses fix/, not bugfix/
  assert.strictEqual(recommend('Task', 'ABC-14', 'tidy'), 'feature/ABC-14-tidy');
  assert.strictEqual(recommend('Sub-task', 'ABC-15', 'x'), 'feature/ABC-15-x');
});

test('recommend: a repo can override the type→prefix map (e.g. customer wants bugfix/)', () => {
  const opts = { typePrefixes: { Bug: 'bugfix' } };
  assert.strictEqual(recommend('Bug', 'ABC-13', 'x', opts), 'bugfix/ABC-13-x');
  assert.strictEqual(recommend('Story', 'ABC-1', 'y', opts), 'feature/ABC-1-y'); // untouched types keep defaults
});

test('recommend: an unknown/blank type falls back to feature', () => {
  assert.strictEqual(recommend('', 'ABC-1', 'y'), 'feature/ABC-1-y');
  assert.strictEqual(recommend('Spike', 'ABC-2', 'z'), 'feature/ABC-2-z');
});

test('recommend: a repo that pinned a specific prefix is honored over type-derivation', () => {
  // /start adopted the repo's consistent "feat/" convention → keep it even for a Bug
  assert.strictEqual(recommend('Bug', 'HTX-5', 'patch', { pattern: 'feat/<KEY>-<slug>' }), 'feat/HTX-5-patch');
});

test('recommend: a <type> token in the pattern is substituted with the derived prefix', () => {
  assert.strictEqual(recommend('Bug', 'HTX-5', 'patch', { pattern: '<type>/<KEY>-<slug>' }), 'fix/HTX-5-patch');
});

test('slugify: lowercases, hyphenates, strips punctuation, trims length', () => {
  assert.strictEqual(slugify('Add Forgot Password!'), 'add-forgot-password');
  assert.strictEqual(slugify('  weird__name  '), 'weird-name');
  assert.ok(slugify('a'.repeat(80)).length <= 50);
});

test('conforms: a branch carrying the key behind a prefix segment passes; a bare name fails', () => {
  assert.strictEqual(conforms('feature/ABC-12-add-login', 'ABC-12'), true);
  assert.strictEqual(conforms('bugfix/ABC-13-fix', 'ABC-13'), true);
  assert.strictEqual(conforms('add-login', 'ABC-12'), false);          // no prefix, no key
  assert.strictEqual(conforms('feature/wrong-key', 'ABC-12'), false);  // key missing
});

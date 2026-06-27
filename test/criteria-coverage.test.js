'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseCriteriaIds, referencedIds, coverage } = require('../bin/criteria-coverage.js');

test('parseCriteriaIds: pulls deduped criterion ids from a manifest (object or JSON string)', () => {
  const manifest = { issueKey: 'MBI-61', criteria: [{ id: 'AC-1' }, { id: 'AC-2' }] };
  assert.deepStrictEqual(parseCriteriaIds(manifest), ['AC-1', 'AC-2']);
  // accepts a raw JSON string (the committed manifest file contents)
  assert.deepStrictEqual(parseCriteriaIds(JSON.stringify(manifest)), ['AC-1', 'AC-2']);
  // dedups repeated ids; preserves first-seen order
  assert.deepStrictEqual(parseCriteriaIds({ criteria: [{ id: 'AC-2' }, { id: 'AC-1' }, { id: 'AC-2' }] }), ['AC-2', 'AC-1']);
  // no criteria / malformed → empty list (never throws)
  assert.deepStrictEqual(parseCriteriaIds({}), []);
  assert.deepStrictEqual(parseCriteriaIds('not json'), []);
  assert.deepStrictEqual(parseCriteriaIds(null), []);
});

test('referencedIds: finds [AC-N] tokens in test text; brackets required; ignores bare ids + Jira keys', () => {
  // a test binds a criterion by naming its id in brackets
  assert.deepStrictEqual(referencedIds("test('[AC-1] user can x', () => {})"), ['AC-1']);
  // tolerates a Jira key alongside the AC id inside the brackets
  assert.deepStrictEqual(referencedIds("describe('[MBI-61 AC-2] ...', ...)"), ['AC-2']);
  // multiple bracketed ids on one line; deduped, first-seen order
  assert.deepStrictEqual(referencedIds("it('[AC-3][AC-1] both [AC-3]')"), ['AC-3', 'AC-1']);
  // a bare AC-9 (no brackets) does NOT count — it collides with the Jira-key regex, so brackets disambiguate
  assert.deepStrictEqual(referencedIds('// see AC-9 for context'), []);
  // a bracketed Jira key with no AC id yields nothing
  assert.deepStrictEqual(referencedIds("test('[MBI-61] plain')"), []);
  assert.deepStrictEqual(referencedIds(''), []);
});

test('coverage: every authored criterion must be pinned; a missing one is uncovered (ok:false)', () => {
  const crit = [{ id: 'AC-1' }, { id: 'AC-2' }];
  assert.deepStrictEqual(coverage(crit, ['AC-1', 'AC-2']),
    { covered: ['AC-1', 'AC-2'], uncovered: [], deferred: [], ok: true });
  assert.deepStrictEqual(coverage(crit, ['AC-1']),
    { covered: ['AC-1'], uncovered: ['AC-2'], deferred: [], ok: false });
  // no criteria authored → trivially ok (AC-6 opt-in: nothing to enforce)
  assert.deepStrictEqual(coverage([], []), { covered: [], uncovered: [], deferred: [], ok: true });
  // foundIds accepted as a Set too
  assert.strictEqual(coverage(crit, new Set(['AC-1', 'AC-2'])).ok, true);
});

test('coverage: a criterion with a defer marker is deferred, not hard-uncovered (ok stays true)', () => {
  const crit = [{ id: 'AC-1' }, { id: 'AC-2', defer: 'blocked on upstream API' }];
  assert.deepStrictEqual(coverage(crit, ['AC-1']),
    { covered: ['AC-1'], uncovered: [], deferred: ['AC-2'], ok: true });
  // a deferred criterion that DOES have a test counts as covered (defer is a ceiling, not a floor)
  assert.deepStrictEqual(coverage(crit, ['AC-1', 'AC-2']),
    { covered: ['AC-1', 'AC-2'], uncovered: [], deferred: [], ok: true });
});

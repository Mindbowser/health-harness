'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseMutationScore } = require('../bin/mutation-emit.js');

// MBI-45 — mutation:emit runner. Pluggable: it parses a mutation SCORE out of whatever report/output the
// team's tool produces (no bundled mutation dependency), then the CLI emits the existing test_strength event.
test('MBI-45: parseMutationScore reads a Stryker-style JSON report (mutationScore) → rounded int', () => {
  assert.strictEqual(parseMutationScore('{"mutationScore": 76.54}'), 77);
});

test('MBI-45: parseMutationScore reads a "Mutation score: N%" console line → rounded int', () => {
  assert.strictEqual(parseMutationScore('Ran 200 mutants.\nMutation score: 76.54%\nDone.'), 77);
  assert.strictEqual(parseMutationScore('mutation score 80 %'), 80);
});

test('MBI-45: parseMutationScore → null on empty / garbage / null (graceful no-op, never throws)', () => {
  assert.strictEqual(parseMutationScore(''), null);
  assert.strictEqual(parseMutationScore(null), null);
  assert.strictEqual(parseMutationScore(undefined), null);
  assert.strictEqual(parseMutationScore('no number here'), null);
  assert.strictEqual(parseMutationScore('{"notScore": 5}'), null);
});

const { sanitize } = require('../bin/usage-log.js');
test('MBI-45: privacy — test_strength keeps only kind + numeric score (no report paths/detail)', () => {
  assert.deepStrictEqual(
    sanitize('test_strength', { kind: 'mutation', score: 77, report: '/abs/path/report.json', detail: 'survived: foo()' }),
    { kind: 'mutation', score: 77 });
});

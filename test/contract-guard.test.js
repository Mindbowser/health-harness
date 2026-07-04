'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { assessSliceContract } = require('../bin/contract-guard.js');

test('a slice depending on an UNBUILT api with no contract test cannot be honestly green', () => {
  const r = assessSliceContract({ dependsOnUnbuiltApi: true });
  assert.strictEqual(r.honest, false);
  assert.strictEqual(r.action, 'block-or-contract');
  assert.ok(r.reasons.some((x) => /mock|stub|contract|not built|unbuilt/i.test(x)));
});

test('a contract test (or an integration test) makes it honest even before the api is built', () => {
  assert.strictEqual(assessSliceContract({ dependsOnUnbuiltApi: true, hasContractTest: true }).honest, true);
  assert.strictEqual(assessSliceContract({ dependsOnUnbuiltApi: true, hasIntegrationTest: true }).honest, true);
});

test('a slice that does not depend on an unbuilt api is honest (built together / no dependency)', () => {
  const r = assessSliceContract({ dependsOnUnbuiltApi: false });
  assert.strictEqual(r.honest, true);
  assert.strictEqual(r.action, 'ok');
  assert.deepStrictEqual(r.reasons, []);
});

test('missing/unknown signals default to honest (no false block)', () => {
  assert.strictEqual(assessSliceContract({}).honest, true);
});

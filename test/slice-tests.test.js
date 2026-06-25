'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { classifyDiff } = require('../bin/slice-tests.js');

test('classifyDiff: source-only change flags behaviorChangeNoTests; source + tests is clean', () => {
  assert.deepStrictEqual(classifyDiff(['src/login.ts']), { hasSource: true, hasTests: false, behaviorChangeNoTests: true });
  assert.deepStrictEqual(classifyDiff(['src/login.ts', 'src/login.test.ts']), { hasSource: true, hasTests: true, behaviorChangeNoTests: false });
});

test('classifyDiff: recognizes test conventions across stacks; ignores docs/config', () => {
  for (const t of ['src/foo.spec.js', 'pkg/__tests__/foo.ts', 'app/test_user.py', 'svc/user_test.go', 'test/x.test.js']) {
    assert.strictEqual(classifyDiff([t]).hasTests, true, t);
  }
  assert.deepStrictEqual(classifyDiff(['README.md', 'package.json', 'config.yaml']), { hasSource: false, hasTests: false, behaviorChangeNoTests: false });
});

test('classifyDiff: a tests-only change is not a behavior change', () => {
  assert.deepStrictEqual(classifyDiff(['src/foo.test.ts']), { hasSource: false, hasTests: true, behaviorChangeNoTests: false });
});

test('classifyDiff: non-behavioral source files (config/.d.ts/stories/generated) are NOT flagged', () => {
  // a config/.d.ts-only change shouldn't read as "shipped behavior with no tests"
  for (const f of ['vite.config.ts', 'webpack.config.js', 'src/types.d.ts', 'Button.stories.tsx', 'src/api.gen.ts']) {
    assert.deepStrictEqual(classifyDiff([f]), { hasSource: false, hasTests: false, behaviorChangeNoTests: false }, f);
  }
  // real logic next to a config still counts as source
  assert.strictEqual(classifyDiff(['src/login.ts', 'vite.config.ts']).hasSource, true);
});

test('classifyDiff: extra test conventions (cypress / e2e / .cy.ts) recognized', () => {
  for (const t of ['cypress/login.cy.ts', 'e2e/checkout.spec.ts', 'src/foo.cy.tsx']) {
    assert.strictEqual(classifyDiff([t]).hasTests, true, t);
  }
});

test('classifyDiff: a project can register its own test convention via extraTestRe', () => {
  // a team whose tests live in /qa/ and end in Check.kt — unknown to the defaults → false flag without override
  assert.strictEqual(classifyDiff(['src/Pay.kt', 'qa/PayCheck.kt']).behaviorChangeNoTests, true);
  // with the project pattern registered, the same diff is recognized as tested
  const extraTestRe = /(?:^|\/)qa\/|Check\.kt$/i;
  const r = classifyDiff(['src/Pay.kt', 'qa/PayCheck.kt'], { extraTestRe });
  assert.strictEqual(r.hasTests, true);
  assert.strictEqual(r.behaviorChangeNoTests, false);
});

test('classifyDiff explain: returns per-file buckets for the dispute drill-down', () => {
  const r = classifyDiff(['src/login.ts', 'src/login.test.ts', 'README.md', 'vite.config.ts'], { explain: true });
  assert.deepStrictEqual(r.buckets.tests, ['src/login.test.ts']);
  assert.deepStrictEqual(r.buckets.source, ['src/login.ts']);
  assert.deepStrictEqual(r.buckets.ignored, ['README.md', 'vite.config.ts']);
  // buckets only appear when asked — default shape stays stable for existing callers
  assert.strictEqual(classifyDiff(['src/login.ts']).buckets, undefined);
});

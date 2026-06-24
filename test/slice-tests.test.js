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

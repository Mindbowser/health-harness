'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { detectTestConfig, isStubTestScript } = require('../bin/test-detect.js');

test('isStubTestScript: the npm default stub and empties are stubs; a real command is not', () => {
  assert.strictEqual(isStubTestScript('echo "Error: no test specified" && exit 1'), true);
  assert.strictEqual(isStubTestScript(''), true);
  assert.strictEqual(isStubTestScript(undefined), true);
  assert.strictEqual(isStubTestScript('node --test'), false);
  assert.strictEqual(isStubTestScript('jest'), false);
});

test('detectTestConfig: a real test script → runnable, gate is npm test', () => {
  const d = detectTestConfig({ scripts: { test: 'node --test' } }, []);
  assert.strictEqual(d.runnable, true);
  assert.strictEqual(d.framework, 'node');
  assert.strictEqual(d.gateCommand, 'npm test');
  assert.strictEqual(d.source, 'script');
});

test('detectTestConfig: framework from a dependency or config file when the script is a stub/missing', () => {
  const jest = detectTestConfig({ devDependencies: { jest: '^30' }, scripts: { test: 'echo "Error: no test specified" && exit 1' } }, []);
  assert.strictEqual(jest.framework, 'jest');
  assert.strictEqual(jest.runnable, true);          // can run npx jest even though the npm script is a stub
  assert.strictEqual(jest.gateCommand, 'npx jest');
  assert.strictEqual(jest.stubScript, true);        // ...but the npm test script is a stub → flag it

  const vitest = detectTestConfig({}, ['vitest.config.ts']);
  assert.strictEqual(vitest.framework, 'vitest');
  assert.strictEqual(vitest.gateCommand, 'npx vitest run');
});

test('detectTestConfig: non-JS frameworks detected from marker files', () => {
  assert.strictEqual(detectTestConfig({}, ['pytest.ini']).framework, 'pytest');
  assert.strictEqual(detectTestConfig({}, ['go.mod']).framework, 'go');
});

test('detectTestConfig: nothing configured → not runnable (onboarding must establish a gate first)', () => {
  const d = detectTestConfig({ scripts: { build: 'tsc' } }, ['README.md']);
  assert.strictEqual(d.runnable, false);
  assert.strictEqual(d.framework, 'none');
  assert.strictEqual(d.gateCommand, null);
});

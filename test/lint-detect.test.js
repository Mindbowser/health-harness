'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { detectLint, gateRunsLint, lintConvention } = require('../bin/lint-detect.js');

test('detectLint: an explicit lint script wins and is the command to run', () => {
  const d = detectLint({ scripts: { lint: 'eslint .' } }, []);
  assert.strictEqual(d.hasLinter, true);
  assert.strictEqual(d.command, 'npm run lint');
  assert.strictEqual(d.source, 'script');
});

test('detectLint: a linter dependency is detected even without a lint script', () => {
  const eslint = detectLint({ devDependencies: { eslint: '^9' } }, []);
  assert.strictEqual(eslint.hasLinter, true);
  assert.strictEqual(eslint.tool, 'eslint');
  assert.strictEqual(eslint.source, 'dep');
  const biome = detectLint({ devDependencies: { '@biomejs/biome': '^1' } }, []);
  assert.strictEqual(biome.hasLinter, true);
  assert.strictEqual(biome.tool, 'biome');
});

test('detectLint: a config file alone counts as a configured linter', () => {
  assert.strictEqual(detectLint({}, ['eslint.config.js']).hasLinter, true);
  assert.strictEqual(detectLint({}, ['.eslintrc.json']).hasLinter, true);
  assert.strictEqual(detectLint({}, ['biome.json']).source, 'config');
});

test('detectLint: no linter anywhere → hasLinter false, no command', () => {
  const d = detectLint({ scripts: { test: 'node --test' } }, ['README.md']);
  assert.strictEqual(d.hasLinter, false);
  assert.strictEqual(d.command, null);
  assert.strictEqual(d.source, 'none');
});

test('gateRunsLint: true only when lint is literally invoked by the gate command (honest, no guessing)', () => {
  assert.strictEqual(gateRunsLint('npm run lint && node --test'), true);
  assert.strictEqual(gateRunsLint('eslint . && vitest run'), true);
  assert.strictEqual(gateRunsLint('biome check .'), true);
  assert.strictEqual(gateRunsLint('node --test'), false);        // tests only — lint not in the gate
  assert.strictEqual(gateRunsLint('npm run verify'), false);     // opaque alias — can't claim lint runs
  assert.strictEqual(gateRunsLint(''), false);
});

test('lintConvention: records presence + command + whether the gate already runs it (the onboarding gap)', () => {
  const withGap = lintConvention({ devDependencies: { eslint: '^9' } }, [], 'node --test');
  assert.deepStrictEqual(withGap, { present: true, command: 'npx eslint .', tool: 'eslint', source: 'dep', inGate: false });
  const clean = lintConvention({ scripts: { lint: 'eslint .' } }, [], 'npm run lint && node --test');
  assert.strictEqual(clean.inGate, true);
  const none = lintConvention({}, [], 'node --test');
  assert.deepStrictEqual(none, { present: false, command: null, tool: null, source: 'none', inGate: false });
});

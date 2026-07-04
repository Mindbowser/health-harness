#!/usr/bin/env node
/**
 * test-detect.js — deterministic "is a test runner configured, and can we run a red→green cycle?" (MBI-95).
 *
 * A build was once started with no runnable test config, so the TDD loop couldn't begin. Onboard/scaffold
 * must PROVE the loop works, not assume it. This detects the framework + the command that runs the suite;
 * the skill then runs the red→green smoke (write a failing test → see RED → make it pass → see GREEN →
 * remove it) and records `{ gate, testFramework }` in .health-harness/project.json.
 *
 * Pure core (detectTestConfig / isStubTestScript) is unit-tested; the CLI wires it to the repo.
 */
'use strict';

// dependency (or devDependency) → framework + standalone command.
const FRAMEWORK_DEPS = [
  ['jest', 'jest', 'npx jest'],
  ['vitest', 'vitest', 'npx vitest run'],
  ['mocha', 'mocha', 'npx mocha'],
  ['ava', 'ava', 'npx ava'],
  ['jasmine', 'jasmine', 'npx jasmine'],
  ['@playwright/test', 'playwright', 'npx playwright test'],
];
// config/marker file → framework + command (covers non-JS stacks too).
const FRAMEWORK_FILES = [
  [/^jest\.config\.(js|cjs|mjs|ts|json)$/, 'jest', 'npx jest'],
  [/^vitest\.config\.(js|cjs|mjs|ts)$/, 'vitest', 'npx vitest run'],
  [/^\.mocharc(\.(js|cjs|json|ya?ml))?$/, 'mocha', 'npx mocha'],
  [/^(pytest\.ini|tox\.ini|pyproject\.toml|setup\.cfg)$/, 'pytest', 'pytest'],
  [/^go\.mod$/, 'go', 'go test ./...'],
  [/^Gemfile$/, 'rspec', 'bundle exec rspec'],
];
// a test script that literally runs node's built-in runner.
const NODE_TEST_RE = /\bnode\b.*--test\b|node:test/;

/** Pure: is a package.json `test` script the npm default stub (or empty)? */
function isStubTestScript(script) {
  const s = String(script || '').trim();
  return !s || /no test specified|exit 1/i.test(s);
}

/** Pure: detect the test framework + the command that runs the suite, from package.json + repo-root files.
 * A real `test` script wins (gate = npm test); otherwise infer from a dependency or a config/marker file. */
function detectTestConfig(pkg, files) {
  const p = pkg || {};
  const scripts = p.scripts || {};
  const testScript = scripts.test;
  const stub = isStubTestScript(testScript);

  if (!stub) {
    const fw = NODE_TEST_RE.test(testScript) ? 'node'
      : (FRAMEWORK_DEPS.find(([, name]) => new RegExp(`\\b${name}\\b`).test(testScript)) || [])[1] || 'script';
    return { framework: fw, gateCommand: 'npm test', runnable: true, stubScript: false, source: 'script' };
  }

  const deps = { ...(p.devDependencies || {}), ...(p.dependencies || {}) };
  for (const [dep, framework, cmd] of FRAMEWORK_DEPS) {
    if (deps[dep]) return { framework, gateCommand: cmd, runnable: true, stubScript: true, source: 'dep' };
  }
  for (const f of files || []) {
    const hit = FRAMEWORK_FILES.find(([re]) => re.test(String(f)));
    if (hit) return { framework: hit[1], gateCommand: hit[2], runnable: true, stubScript: true, source: 'config' };
  }
  return { framework: 'none', gateCommand: null, runnable: false, stubScript: stub, source: 'none' };
}

module.exports = { detectTestConfig, isStubTestScript, FRAMEWORK_DEPS };

// CLI: `test-detect.js` → print the detected test config JSON for the cwd (package.json + root file list).
if (require.main === module) {
  const fs = require('fs'), path = require('path'), dir = process.cwd();
  let pkg = {}; try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { /* none */ }
  let files = []; try { files = fs.readdirSync(dir); } catch { /* none */ }
  process.stdout.write(JSON.stringify(detectTestConfig(pkg, files)));
  process.exit(0);
}

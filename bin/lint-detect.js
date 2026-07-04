#!/usr/bin/env node
/**
 * lint-detect.js — deterministic "is a linter configured, and is it in the gate?" for onboard/scaffold.
 *
 * The gate is meant to be tests + typecheck + LINT (MBI-99). Whether a repo actually lints was a manual
 * judgement; this makes it a fact: detect the linter (lint script → dependency → config file) and report
 * whether the configured gate command literally runs it. Onboarding records the result as the `lint`
 * convention (see conventions.js) and flags the gap when a linter exists but the gate doesn't run it.
 *
 * Pure core (detectLint / gateRunsLint / lintConvention) is unit-tested; the CLI wires it to the repo.
 */
'use strict';

// devDependency (or dependency) name → canonical tool + the command to invoke it standalone.
const LINTER_DEPS = [
  ['eslint', 'eslint', 'npx eslint .'],
  ['@biomejs/biome', 'biome', 'npx biome check .'],
  ['biome', 'biome', 'npx biome check .'],
  ['oxlint', 'oxlint', 'npx oxlint'],
  ['xo', 'xo', 'npx xo'],
  ['standard', 'standard', 'npx standard'],
  ['tslint', 'tslint', 'npx tslint -p .'],
  ['rome', 'rome', 'npx rome check .'],
];

// A config file's mere presence means a linter is wired even if it isn't a declared dependency.
const CONFIG_RE = /^(\.eslintrc(\.(js|cjs|mjs|json|ya?ml))?|eslint\.config\.(js|cjs|mjs|ts)|biome\.jsonc?|\.xo-config(\.\w+)?|tslint\.json)$/;

// Does a command literally invoke a linter? (Used to tell if the GATE runs lint — no guessing past opaque aliases.)
const LINT_INVOKE_RE = /\b(eslint|biome|oxlint|tslint|standard|xo)\b|\bnpm run lint\b|\b(yarn|pnpm) lint\b|\brun lint\b/i;

/** Pure: detect the linter from a parsed package.json + a list of repo-root filenames. Precedence:
 * an explicit `lint` script → a known linter dependency → a config file → none. */
function detectLint(pkg, files) {
  const p = pkg || {};
  const scripts = p.scripts || {};
  if (scripts.lint) return { hasLinter: true, command: 'npm run lint', tool: 'script', source: 'script' };
  const deps = { ...(p.devDependencies || {}), ...(p.dependencies || {}) };
  for (const [dep, tool, command] of LINTER_DEPS) {
    if (deps[dep]) return { hasLinter: true, command, tool, source: 'dep' };
  }
  const cfg = (files || []).find((f) => CONFIG_RE.test(String(f)));
  if (cfg) return { hasLinter: true, command: 'npx eslint .', tool: 'eslint', source: 'config' };
  return { hasLinter: false, command: null, tool: null, source: 'none' };
}

/** Pure: does the gate command literally run a linter? Only true when lint is visible in the command — an
 * opaque alias (`npm run verify`) can't be claimed to lint, so it's reported as a gap for onboarding to close. */
function gateRunsLint(gateCmd) {
  return LINT_INVOKE_RE.test(String(gateCmd || ''));
}

/** Pure: the `lint` convention to record — presence, how to run it, and whether the gate already does. */
function lintConvention(pkg, files, gateCmd) {
  const d = detectLint(pkg, files);
  return { present: d.hasLinter, command: d.command, tool: d.tool, source: d.source, inGate: gateRunsLint(gateCmd) };
}

module.exports = { detectLint, gateRunsLint, lintConvention, LINTER_DEPS, CONFIG_RE };

// CLI: `lint-detect.js [--gate "<gate command>"]` → prints the lint convention JSON for the cwd, reading
// package.json + the repo-root file list. Exit 0 always (advisory).
if (require.main === module) {
  const fs = require('fs'), path = require('path'), dir = process.cwd();
  let pkg = {}; try { pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); } catch { /* none */ }
  let files = []; try { files = fs.readdirSync(dir); } catch { /* none */ }
  let gate = '';
  const gi = process.argv.indexOf('--gate');
  if (gi >= 0 && process.argv[gi + 1]) gate = process.argv[gi + 1];
  else { try { gate = JSON.parse(fs.readFileSync(path.join(dir, '.health-harness', 'project.json'), 'utf8')).gate || ''; } catch { /* none */ } }
  process.stdout.write(JSON.stringify(lintConvention(pkg, files, gate)));
  process.exit(0);
}

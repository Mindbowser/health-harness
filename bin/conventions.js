#!/usr/bin/env node
/**
 * conventions.js — the committed record of a repo's logging/audit/datetime conventions + gate completeness
 * (lint/typecheck/coverage-%), discovered ONCE at /start/onboard/scaffold and reused silently thereafter.
 * `.health-harness/conventions.json` is the discover-once→persist→reuse artifact: the compliance detectors
 * (criteria-detect) read it to upgrade a heuristic ASK into a deterministic DENY — "what counts as the
 * centralised logger / audit helper" becomes a known fact, not a guess.
 */
'use strict';

// The setup keys onboarding must establish (and record) before the build loop relies on them.
const REQUIRED = ['logging', 'audit', 'datetime', 'lint', 'typecheck'];

function file(cwd) { return require('path').join(cwd || process.cwd(), '.health-harness', 'conventions.json'); }

/** Impure: the conventions object, or {} when none is recorded yet. Never throws. */
function read(cwd) {
  try { return JSON.parse(require('fs').readFileSync(file(cwd), 'utf8')) || {}; } catch { return {}; }
}

/** Impure: write (merge-replace) the conventions object; returns the path. */
function write(cwd, obj) {
  const fs = require('fs'), path = require('path');
  fs.mkdirSync(path.join(cwd || process.cwd(), '.health-harness'), { recursive: true });
  const p = file(cwd);
  fs.writeFileSync(p, JSON.stringify(obj || {}, null, 2) + '\n');
  return p;
}

/** Pure: which REQUIRED setup keys are absent from a conventions object → the onboarding ask list. A key
 * counts as present when it holds a truthy value (an object for logging/audit/datetime, or true for the
 * boolean gate flags). */
function gaps(conv) {
  const c = conv || {};
  return REQUIRED.filter((k) => {
    const v = c[k];
    if (v == null || v === false) return true;
    if (typeof v === 'object') return Object.keys(v).length === 0;
    return false;
  });
}

module.exports = { read, write, gaps, REQUIRED };

// CLI: onboarding/start records discovered conventions deterministically.
//   conventions.js              → print the current conventions JSON
//   conventions.js set '<json>' → merge <json> into conventions.json
//   conventions.js gaps         → print the missing-setup keys (one per line)
if (require.main === module) {
  const sub = process.argv[2];
  if (sub === 'set') {
    let obj = {};
    try { obj = JSON.parse(process.argv[3] || '{}'); } catch { process.stderr.write('set: argument must be JSON\n'); process.exit(2); }
    const merged = { ...read(process.cwd()), ...obj };
    process.stdout.write(`wrote ${write(process.cwd(), merged)}\n`);
  } else if (sub === 'gaps') {
    process.stdout.write(gaps(read(process.cwd())).join('\n') + '\n');
  } else {
    process.stdout.write(JSON.stringify(read(process.cwd())));
  }
  process.exit(0);
}

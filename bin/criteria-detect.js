#!/usr/bin/env node
/**
 * criteria-detect.js — deterministic detectors over a unified-diff string, used as backstops so a slice
 * can't silently skip a compliance concern even if /align didn't auto-author the criterion. All detectors
 * are PURE (tested) and scan only ADDED content lines (`+…`, never the `+++` header or removed lines) —
 * we gate what the slice ADDS, not what it touches. The wall (outward-guard) maps a hit to ASK/DENY.
 */
'use strict';

/** Pure: the added content lines of a unified diff (`+…` but not the `+++` file header). */
function addedLines(diff) {
  return String(diff || '').split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++'));
}

// PHI access tokens — identifiers that signal a patient-data read/write path.
const PHI_RE = /\b(patient|mrn|ssn|dob|diagnosis|ehr|phi|medical_record)\b/i;
const PHI_GLOBAL = new RegExp(PHI_RE.source, 'gi');

/** Pure: distinct PHI-signal tokens (lowercased, first-seen) appearing on the diff's added lines. Empty
 * list = the slice adds no obvious PHI access. Heuristic by design → the wall treats a hit as ASK. */
function detectPhiSignals(diff) {
  const seen = new Set(), out = [];
  for (const line of addedLines(diff)) {
    const matches = line.match(PHI_GLOBAL) || [];
    for (const m of matches) { const t = m.toLowerCase(); if (!seen.has(t)) { seen.add(t); out.push(t); } }
  }
  return out;
}

/** Impure: the unified diff text for the current branch's slice (added+removed lines vs base). */
function branchDiff(cwd) {
  const dir = cwd || process.cwd();
  try {
    const base = require('./slice-tests.js').baseBranch(dir);
    return require('child_process').execSync(`git diff ${base ? base + '...HEAD' : 'HEAD'}`,
      { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
  } catch { return ''; }
}

/** Impure: the `kind` values authored in this branch's criteria manifest (so a backstop knows whether the
 * matching criterion already exists). [] when there's no manifest. */
function manifestKinds(cwd) {
  const dir = cwd || process.cwd();
  try {
    const key = require('./criteria-coverage.js').branchIssueKey(dir);
    if (!key) return [];
    const m = JSON.parse(require('fs').readFileSync(require('path').join(dir, '.health-harness', 'criteria', `${key}.json`), 'utf8'));
    return (m.criteria || []).map((c) => c.kind).filter(Boolean);
  } catch { return []; }
}

/** Impure: assemble the facts the wall's compliance backstops decide on, for the current branch. */
function currentFacts(cwd) {
  const dir = cwd || process.cwd();
  let profile = 'hipaa';
  try { profile = require('./redaction-scan.js').loadConfig(dir).profile || 'hipaa'; } catch { /* default */ }
  const diff = branchDiff(dir);
  return {
    profile, kinds: manifestKinds(dir),
    phi: detectPhiSignals(diff), logging: detectLoggingIntroduced(diff),
    datetime: detectDateTimeApi(diff), tzMarker: hasTzMarker(diff),
  };
}

// Logger wiring or raw console.* on an added line → the slice "introduces logging".
const LOG_RE = /(createLogger|getLogger|\bwinston\b|\bpino\b|\bbunyan\b|log4j|console\.(log|info|warn|error|debug))/i;

/** Pure: did the slice introduce logging (a logger wiring or a raw console.* call) on an added line? */
function detectLoggingIntroduced(diff) {
  return addedLines(diff).some((l) => LOG_RE.test(l));
}

// Date/time APIs (JS + a few common others) on an added line → the slice does time-specific work.
const DATETIME_RE = /(new\s+Date\b|Date\.now\b|\bmoment\s*\(|\bdayjs\s*\(|Intl\.DateTimeFormat|toLocale(?:Date|Time)?String|\bLocalDate\b|\bInstant\b|time\.Now\s*\()/;
// Explicit timezone-handling acknowledgement: `// tz-safe: <reason>` or `@tz-safe`.
const TZ_MARKER_RE = /tz-safe/i;

/** Pure: did the slice use a date/time API on an added line? */
function detectDateTimeApi(diff) {
  return addedLines(diff).some((l) => DATETIME_RE.test(l));
}

/** Pure: does an added line carry an explicit tz-safe marker (the deterministic acknowledgement)? */
function hasTzMarker(diff) {
  return addedLines(diff).some((l) => TZ_MARKER_RE.test(l));
}

module.exports = { addedLines, detectPhiSignals, detectLoggingIntroduced, detectDateTimeApi, hasTzMarker, branchDiff, manifestKinds, currentFacts };

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
  let conventions = {};
  try { conventions = require('./conventions.js').read(dir); } catch { /* none */ }
  return {
    profile, kinds: manifestKinds(dir), conventions,
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

// Date/time APIs on an added line → the slice does time-specific work. Language-agnostic by design: the
// harness installs into JS, Python, Ruby, .NET, PHP, Go and JVM repos, so a JS-only trigger would SILENTLY
// no-op on a non-JS product repo (a false-negative is worse than a noisy block). Tokens are chosen to be
// date-specific enough that false positives are rare; when one slips through, the cheap `tz-safe` escape
// handles it. (Future precision refinement: key the ambiguous tokens by the diff's file extension.)
const DATETIME_RE = new RegExp([
  // JS / TS
  'new\\s+Date\\b', 'Date\\.now\\b', '\\bmoment\\b', '\\bdayjs\\b', '\\bluxon\\b',
  'Intl\\.DateTimeFormat', 'toLocale(?:Date|Time)?String',
  // Java / Kotlin / JVM
  '\\bLocalDate(?:Time)?\\b', '\\bZonedDateTime\\b', '\\bOffsetDateTime\\b', '\\bInstant\\b', '\\bZoneId\\b',
  // Go
  'time\\.Now\\s*\\(', 'time\\.Parse\\b', 'time\\.Date\\b', 'time\\.LoadLocation\\b',
  // Python
  '\\bdatetime\\b', '\\bzoneinfo\\b', '\\bpytz\\b', '\\bastimezone\\b', '\\butcnow\\b', '\\bfromtimestamp\\b',
  // Ruby
  'Time\\.(?:now|parse|zone|at|current)\\b', '\\bDateTime\\.', '\\bin_time_zone\\b',
  // .NET / C#
  '\\bDateTimeOffset\\b', '\\bDateTime\\b', '\\bTimeZoneInfo\\b',
  // PHP
  '\\bDateTimeImmutable\\b', '\\bstrtotime\\s*\\(', '\\bgmdate\\s*\\(', '\\bmktime\\s*\\(',
  // C / POSIX / general
  '\\bstrftime\\b', '\\bstrptime\\b', '\\blocaltime\\b', '\\bgmtime\\b',
].join('|'));
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

/** Pure: the build-time timezone decision for a slice, from its facts ({datetime, tzMarker, kinds}).
 * Lets the TDD skill raise the question *before* the wall blocks at push time (tier 1.5 of
 * docs/timezone-assurance.md):
 *   'none'      — no date/time API touched → nothing to decide.
 *   'satisfied' — touched a date API but already acknowledged: a `tz-safe` marker OR a `timezone`
 *                 criterion in the manifest (the latter obligates the hostile-clock/matrix test).
 *   'decide'    — touched a date API with neither → the agent must resolve it: ASK the human (the
 *                 AskUserQuestion: converts user-facing time? → `kind:timezone` + matrix test / internal
 *                 → `tz-safe` / defer), or AFK apply the safe default (treat as TZ-relevant unless it's
 *                 obviously a duration/internal-UTC/log timestamp). Never silently skip — the wall backstops. */
function tzGateAction(facts) {
  const f = facts || {};
  if (!f.datetime) return 'none';
  if (f.tzMarker || (Array.isArray(f.kinds) && f.kinds.includes('timezone'))) return 'satisfied';
  return 'decide';
}

module.exports = { addedLines, detectPhiSignals, detectLoggingIntroduced, detectDateTimeApi, hasTzMarker, tzGateAction, branchDiff, manifestKinds, currentFacts };

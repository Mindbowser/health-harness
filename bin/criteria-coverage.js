#!/usr/bin/env node
/**
 * criteria-coverage.js — deterministic "is every authored acceptance criterion pinned by a real test?"
 *
 * The build loop authors machine-identifiable criteria (each a stable `[AC-N]` id) into a committed
 * manifest (.health-harness/criteria/<KEY>.json). `/tdd` binds a test to a criterion by naming the id in
 * the test. This module reduces "are they all covered?" to a pure git-diff computation — NO LLM in the
 * validation path. Mirrors slice-tests.js: parseCriteriaIds/referencedIds/coverage are pure (tested);
 * the diff/file reads are I/O.
 */
'use strict';

/** Pure: a manifest (object or JSON string) → its criterion ids, deduped, first-seen order. Never throws
 * — malformed input or no criteria yields []. */
function parseCriteriaIds(manifest) {
  let m = manifest;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch { return []; } }
  const list = m && Array.isArray(m.criteria) ? m.criteria : [];
  const seen = new Set();
  for (const c of list) { const id = c && c.id; if (id && !seen.has(id)) seen.add(id); }
  return [...seen];
}

/** Pure: the `AC-N` ids a test file binds, deduped (first-seen). A binding is an `AC-N` token that appears
 * INSIDE square brackets — `[AC-1]`, `[MBI-61 AC-2]`, `[AC-1][AC-3]`. Brackets are required so a bare
 * `AC-1` (which collides with the wall's Jira-key regex) is never mistaken for a binding. */
function referencedIds(text) {
  const out = [];
  const seen = new Set();
  const brackets = String(text || '').match(/\[[^\]]*\]/g) || [];
  for (const b of brackets) {
    const ids = b.match(/\bAC-\d+\b/g) || [];
    for (const id of ids) { if (!seen.has(id)) { seen.add(id); out.push(id); } }
  }
  return out;
}

/** Pure core (the tested heart): given the manifest criteria ([{id, defer?}, …]) and the ids found across
 * the slice's test files, classify each criterion. A criterion is `covered` if a test binds its id;
 * otherwise `deferred` if it carries a defer marker (a recorded, auditable escape → ASK downstream), else
 * `uncovered` (→ DENY downstream). `ok` is true only when nothing is hard-uncovered. `found` may be an
 * array or a Set. */
function coverage(criteria, found) {
  const foundSet = found instanceof Set ? found : new Set(found || []);
  const covered = [], uncovered = [], deferred = [];
  for (const c of criteria || []) {
    const id = c && c.id;
    if (!id) continue;
    if (foundSet.has(id)) covered.push(id);
    else if (c.defer) deferred.push(id);
    else uncovered.push(id);
  }
  return { covered, uncovered, deferred, ok: uncovered.length === 0 };
}

/** Impure: the Jira key carried by the current branch name (feature/MBI-61-… → MBI-61), or null. */
function branchIssueKey(cwd) {
  try {
    const b = require('child_process').execSync('git rev-parse --abbrev-ref HEAD',
      { cwd: cwd || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    const m = b.match(/[A-Z][A-Z0-9]+-\d+/);
    return m ? m[0] : null;
  } catch { return null; }
}

/** Impure: resolve coverage for the current branch's slice. Returns { hasManifest:false } when there's no
 * committed criteria manifest for this branch's ticket (AC-6 opt-in: nothing to enforce). Otherwise reads
 * the manifest + the slice's test files (reusing slice-tests' diff classification) and computes coverage. */
function currentCoverage(cwd) {
  const dir = cwd || process.cwd();
  const fs = require('fs'), path = require('path');
  const key = branchIssueKey(dir);
  if (!key) return { hasManifest: false };
  let manifest;
  try { manifest = JSON.parse(fs.readFileSync(path.join(dir, '.health-harness', 'criteria', `${key}.json`), 'utf8')); }
  catch { return { hasManifest: false }; }
  const criteria = Array.isArray(manifest.criteria) ? manifest.criteria : [];
  const st = require('./slice-tests.js');
  const cls = st.classifyDiff(st.diffPaths(st.baseBranch(dir), dir), { explain: true, extraTestRe: st.projectTestRe(dir) });
  const found = new Set();
  for (const f of cls.buckets.tests) {
    try { for (const id of referencedIds(fs.readFileSync(path.join(dir, f), 'utf8'))) found.add(id); } catch { /* unreadable → skip */ }
  }
  return { hasManifest: true, issueKey: key, cov: coverage(criteria, found) };
}

module.exports = { parseCriteriaIds, referencedIds, coverage, branchIssueKey, currentCoverage };

// CLI: the /tdd gate + /ship preview read this.
//   criteria-coverage.js            → JSON verdict (machine-readable)
//   criteria-coverage.js --explain  → per-criterion ✓ covered / ✗ uncovered / ⏸ deferred drill-down, so a
//                                     DENY at push is disputable against the exact ids (pure, nothing to argue).
if (require.main === module) {
  const st = currentCoverage();
  if (process.argv.includes('--explain')) {
    const out = [];
    if (!st.hasManifest) {
      out.push('Criteria coverage: no manifest for this branch — feature dormant (nothing to enforce).');
    } else {
      const c = st.cov;
      const verdict = c.uncovered.length ? `✗ ${c.uncovered.length} criterion(s) with NO test`
        : c.deferred.length ? `⏸ ${c.deferred.length} deferred (approve at /ship)` : '✓ all criteria pinned by a test';
      out.push(`Criteria coverage — ${st.issueKey}: ${verdict}`);
      out.push(`  ✓ covered  (${c.covered.length}): ${c.covered.join(', ') || '—'}`);
      out.push(`  ✗ NO test  (${c.uncovered.length}): ${c.uncovered.join(', ') || '—'}`);
      out.push(`  ⏸ deferred (${c.deferred.length}): ${c.deferred.join(', ') || '—'}`);
      if (c.uncovered.length) out.push('\nAdd a test naming each [AC-N] above, or mark it [AC-N defer:<reason>] in the manifest to ship without one.');
    }
    process.stdout.write(out.join('\n') + '\n');
  } else {
    process.stdout.write(JSON.stringify(st));
  }
  process.exit(0);
}

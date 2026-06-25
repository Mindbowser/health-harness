#!/usr/bin/env node
/**
 * slice-tests.js — deterministic "did this slice actually add tests?" A green gate proves tests PASS; it does
 * NOT prove the new behavior was tested. The most common gap is a source change with ZERO test changes — and
 * that's pure `git diff`, no judgment. We classify the branch diff and emit it as telemetry (attributed to the
 * ticket) so we can later analyse, per dev / per project / per ticket, who is writing tests vs shipping
 * untested behavior — the thing that matters most when an agent generates the code.
 *
 * classifyDiff is pure (tested); diffPaths/baseBranch are I/O.
 */
'use strict';

// A path is a TEST if it looks like one; otherwise, if it's a behavioral source file, it's SOURCE.
const TEST_RE = /(?:[._-]|\b)(?:test|spec)\.[a-z0-9]+$|(?:^|\/)(?:__tests__|tests?|e2e|cypress|spec)\/|(?:^|\/)test_[^/]+\.py$|_test\.(?:go|py|rb|java)$|\.cy\.[a-z0-9]+$/i;
const SRC_RE = /\.(?:ts|tsx|js|jsx|cjs|mjs|py|go|rb|java|cs|php|rs|kt|swift|c|cc|cpp|h|hpp|scala|ex|exs)$/i;
// Matches a source extension but is NOT behavioral logic that warrants its own test (config, type decls,
// stories, generated) — so a config/.d.ts-only change isn't flagged as "shipped behavior, no tests".
const NONBEHAVIORAL_RE = /\.d\.ts$|\.(?:config|stories)\.(?:tsx?|jsx?|cjs|mjs)$|(?:^|\/)(?:vite|webpack|rollup|jest|vitest|babel|eslint|prettier|tailwind|postcss|next|nuxt|tsup|metro|rspack)\.config\.[a-z.]+$|(?:^|\/)[^/]*\.gen\.[a-z]+$/i;

/** Pure: changed paths → did the slice touch behavioral source? did it touch tests? (a test path counts as
 * test, not source). opts.extraTestRe registers a project's own test convention; opts.explain also returns
 * the per-file buckets — the deterministic drill-down for a disputed flag. */
function classifyDiff(paths, opts) {
  const extra = opts && opts.extraTestRe;
  let hasSource = false, hasTests = false;
  const buckets = { tests: [], source: [], ignored: [] };
  for (const p of paths || []) {
    const s = String(p);
    if (TEST_RE.test(s) || (extra && extra.test(s)))      { hasTests = true;  buckets.tests.push(s); }
    else if (SRC_RE.test(s) && !NONBEHAVIORAL_RE.test(s)) { hasSource = true; buckets.source.push(s); }
    else buckets.ignored.push(s); // config, docs, css, .d.ts, generated — not behavior that needs a test
  }
  const res = { hasSource, hasTests, behaviorChangeNoTests: hasSource && !hasTests };
  if (opts && opts.explain) res.buckets = buckets;
  return res;
}

/** Impure: file paths changed on this branch vs base. */
function diffPaths(base, cwd) {
  try {
    const range = base ? `${base}...HEAD` : 'HEAD';
    return require('child_process').execSync(`git diff --name-only ${range}`, { cwd: cwd || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch { return []; }
}

/** Impure: the base branch (project.json git.baseBranch/prTarget, else main/master). */
function baseBranch(cwd) {
  const fs = require('fs'), path = require('path'), dir = cwd || process.cwd();
  try { const p = JSON.parse(fs.readFileSync(path.join(dir, '.health-harness', 'project.json'), 'utf8')); const b = (p.git && (p.git.baseBranch || p.git.prTarget)) || p.defaultBranch; if (b) return b; } catch { /* none */ }
  for (const b of ['main', 'master']) { try { require('child_process').execSync(`git rev-parse --verify ${b}`, { cwd: dir, stdio: ['ignore', 'ignore', 'ignore'] }); return b; } catch { /* next */ } }
  return '';
}

/** Impure: a project's own test-file regex from .health-harness/project.json `tests.pattern` (a regex
 * string), so a team with a non-standard test layout isn't false-flagged "no tests". null if none. */
function projectTestRe(cwd) {
  try {
    const fs = require('fs'), path = require('path');
    const p = JSON.parse(fs.readFileSync(path.join(cwd || process.cwd(), '.health-harness', 'project.json'), 'utf8'));
    if (p.tests && p.tests.pattern) return new RegExp(String(p.tests.pattern), 'i');
  } catch { /* none */ }
  return null;
}

module.exports = { classifyDiff, diffPaths, baseBranch, projectTestRe, TEST_RE, SRC_RE, NONBEHAVIORAL_RE };

// CLI: classify the current branch's slice — used by /ship to flag "no new tests".
//   slice-tests.js            → JSON verdict (machine-readable)
//   slice-tests.js --explain  → human drill-down: every changed file bucketed TEST / SOURCE / IGNORED, so a
//                               dev who says "but I added tests" can SEE whether their test file was
//                               recognized (and if not, how to register their convention). Pure git diff —
//                               nothing to argue with.
if (require.main === module) {
  const base = baseBranch();
  const extraTestRe = projectTestRe();
  if (process.argv.includes('--explain')) {
    const r = classifyDiff(diffPaths(base), { explain: true, extraTestRe });
    const out = [];
    const verdict = r.behaviorChangeNoTests ? '⚠ SOURCE CHANGED, NO TESTS ON THIS BRANCH'
      : r.hasTests ? '✓ branch includes tests' : '· no behavioral source change';
    out.push(`Slice classification — base: ${base || '(none)'} … HEAD`);
    out.push(`Verdict: ${verdict}`);
    out.push('');
    out.push(`TESTS recognized (${r.buckets.tests.length}):`);
    r.buckets.tests.forEach((f) => out.push(`  ✓ ${f}`));
    out.push(`SOURCE — behavior expected to have a test (${r.buckets.source.length}):`);
    r.buckets.source.forEach((f) => out.push(`  • ${f}`));
    out.push(`IGNORED — config/docs/css/.d.ts/generated, no test expected (${r.buckets.ignored.length}):`);
    r.buckets.ignored.forEach((f) => out.push(`  - ${f}`));
    if (r.behaviorChangeNoTests) {
      out.push('');
      out.push('Disputing the flag? If you DID add tests, check they appear under TESTS above.');
      out.push('If your test files landed under SOURCE/IGNORED, your naming isn\'t recognized — register it:');
      out.push('  .health-harness/project.json  →  { "tests": { "pattern": "<your-test-regex>" } }');
      out.push('Tests on a different branch / not yet committed vs base also won\'t count until merged here.');
    }
    process.stdout.write(out.join('\n') + '\n');
  } else {
    process.stdout.write(JSON.stringify({ ...classifyDiff(diffPaths(base), { extraTestRe }), base: base || null }));
  }
  process.exit(0);
}

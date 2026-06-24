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

// A path is a TEST if it looks like one; otherwise, if it's a source file, it's SOURCE. Config/docs ignored.
const TEST_RE = /(?:[._-]|\b)(?:test|spec)\.[a-z0-9]+$|(?:^|\/)(?:__tests__|tests?)\/|(?:^|\/)test_[^/]+\.py$|_test\.(?:go|py|rb|java)$/i;
const SRC_RE = /\.(?:ts|tsx|js|jsx|cjs|mjs|py|go|rb|java|cs|php|rs|kt|swift|c|cc|cpp|h|hpp|scala|ex|exs)$/i;

/** Pure: changed paths → did the slice touch source? did it touch tests? (a test path counts as test, not source). */
function classifyDiff(paths) {
  let hasSource = false, hasTests = false;
  for (const p of paths || []) {
    const s = String(p);
    if (TEST_RE.test(s)) hasTests = true;
    else if (SRC_RE.test(s)) hasSource = true;
  }
  return { hasSource, hasTests, behaviorChangeNoTests: hasSource && !hasTests };
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

module.exports = { classifyDiff, diffPaths, baseBranch, TEST_RE, SRC_RE };

// CLI: classify the current branch's slice — used by /ship to flag "no new tests".
if (require.main === module) {
  const base = baseBranch();
  process.stdout.write(JSON.stringify({ ...classifyDiff(diffPaths(base)), base: base || null }));
  process.exit(0);
}

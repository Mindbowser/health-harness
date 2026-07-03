#!/usr/bin/env node
/**
 * doc-scan.js — deterministically discover a repo's own documentation so onboarding READS it first (MBI-105).
 *
 * Before touching code, `/onboard-existing-codebase` should comprehend the project from its own docs —
 * README, existing CLAUDE.md/AGENTS.md, ARCHITECTURE, CONTRIBUTING, /docs, ADRs — not just skim the README.
 * This ranks the doc files by importance so the agent reads the highest-signal ones first and seeds the
 * repo CLAUDE.md from them. Vendored/build dirs are ignored.
 *
 * Pure core (docRank / discoverDocs) is unit-tested; the CLI walks the repo (git ls-files) and prints them.
 */
'use strict';

const IGNORE_DIR_RE = /(^|\/)(node_modules|dist|build|out|vendor|\.git|coverage|\.next|target)\//;

// Ordered priority tiers. Lower rank = read first.
const TIERS = [
  [1, /(^|\/)README(\.[a-z]+)?$/i],
  [2, /(^|\/)(CLAUDE|AGENTS|AI[-_]?RULES)\.md$/i],
  [2, /(^|\/)\.(cursorrules|windsurfrules|clinerules)$/i],
  [3, /(^|\/)(ARCHITECTURE|DESIGN|ADR)([-_].*)?\.(md|mdx|rst|adoc)$/i],
  [3, /(^|\/)docs?\/.*(architect|design|overview|adr).*\.(md|mdx|rst|adoc)$/i],
  [4, /(^|\/)(CONTRIBUTING|DEVELOPMENT|DEVELOPING|SETUP|GETTING[-_]?STARTED|ONBOARDING|HANDBOOK)(\.[a-z]+)?$/i],
  [5, /(^|\/)docs?\/.*\.(md|mdx|rst|adoc)$/i],
  [6, /(^|\/)[^/]*\.(md|mdx|rst|adoc)$/i], // any other top-of-tree markup doc
];

/** Pure: a doc's priority rank (lower = read first); Infinity if it isn't project documentation. */
function docRank(path) {
  const p = String(path || '');
  if (IGNORE_DIR_RE.test(p)) return Infinity;             // vendored/build docs don't describe THIS project
  for (const [rank, re] of TIERS) if (re.test(p)) return rank;
  return Infinity;
}

/** Pure: from a list of repo paths, the documentation files ranked (README → agent rules → architecture →
 * contributing → /docs → other markup). Stable secondary sort by path. */
function discoverDocs(paths) {
  return (paths || [])
    .map((p) => ({ p, r: docRank(p) }))
    .filter((x) => x.r !== Infinity)
    .sort((a, b) => a.r - b.r || a.p.localeCompare(b.p))
    .map((x) => x.p);
}

module.exports = { docRank, discoverDocs, IGNORE_DIR_RE };

// CLI: `doc-scan.js` → print the ranked doc list (JSON) for the cwd, from `git ls-files` (falls back to a
// shallow readdir). Onboarding reads these top-down before proposing any change.
if (require.main === module) {
  const { execSync } = require('child_process');
  let paths = [];
  try {
    paths = execSync('git ls-files', { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' })
      .split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    try { paths = require('fs').readdirSync(process.cwd()); } catch { /* none */ }
  }
  process.stdout.write(JSON.stringify({ docs: discoverDocs(paths) }));
  process.exit(0);
}

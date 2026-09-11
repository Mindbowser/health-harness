#!/usr/bin/env node
/**
 * protected-branch.js — resolve the SET of protected branches and test a name against it (MBI-150).
 *
 * Replaces the single `project.json` baseBranch with a configurable SET (names + globs) so the
 * branch-protection hooks (slice 3, MBI-148) key off what the repo ACTUALLY protects — main/master/prod
 * plus whatever a team adds (dev/qa/stage/uat). Backward compatible: the repo's existing baseBranch/
 * prTarget/defaultBranch are always folded in, so a repo whose base is `develop` still protects it.
 *
 * isProtected()/resolveProtected()/globToRegExp() are pure (exported for tests); the CLI does the I/O.
 */
'use strict';

const { SCHEMA } = require('./harness-config.js');
const DEFAULT_PROTECTED = SCHEMA.protectedBranches.default;

/** Pure: a shell-style glob → an anchored RegExp. `*` matches within a single path segment only
 * (`release/*` protects `release/1.2` but not `release/1.2/hotfix`), matching how teams name branches. */
function globToRegExp(pattern) {
  const esc = String(pattern).replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp('^' + esc + '$'); // case-sensitive on purpose: git branch names are
}

/** Pure: does `branch` match any pattern (exact name or glob)? Never throws; empty inputs → false. */
function isProtected(branch, patterns) {
  if (!branch || !Array.isArray(patterns)) return false;
  return patterns.some((p) => {
    if (p == null) return false;
    return String(p).includes('*') ? globToRegExp(p).test(branch) : String(p) === branch;
  });
}

/** Pure: the deduped protected set = configured `protectedBranches` (or the schema default) unioned with
 * the repo's baseBranch/prTarget/defaultBranch (backward compat). Order: configured first, then project. */
function resolveProtected(opts) {
  const o = opts || {};
  const config = o.config || {};
  const project = o.project || {};
  const git = project.git || {};
  const configured = Array.isArray(config.protectedBranches) ? config.protectedBranches : DEFAULT_PROTECTED;
  const fromProject = [git.baseBranch, git.prTarget, git.defaultBranch, project.defaultBranch];
  const seen = new Set();
  const out = [];
  for (const p of [...configured, ...fromProject]) {
    if (p && !seen.has(p)) { seen.add(p); out.push(p); }
  }
  return out;
}

module.exports = { isProtected, resolveProtected, globToRegExp, DEFAULT_PROTECTED };

// ── CLI ─────────────────────────────────────────────────────────────────────
//   protected-branch.js list          → print the resolved protected set (JSON)
//   protected-branch.js is <branch>   → { branch, protected: true|false }
if (require.main === module) {
  const fs = require('fs'), path = require('path');
  const harnessCfg = require('./harness-config.js');
  const readProject = () => {
    try { return JSON.parse(fs.readFileSync(path.join(process.cwd(), '.health-harness', 'project.json'), 'utf8')); }
    catch { return {}; }
  };
  const eff = harnessCfg.effective({});
  const config = { protectedBranches: eff['protectedBranches'] && eff['protectedBranches'].value };
  const set = resolveProtected({ config, project: readProject() });
  const done = (o) => { process.stdout.write(JSON.stringify(o) + '\n'); process.exit(0); };
  const sub = process.argv[2];
  if (sub === 'is') done({ branch: process.argv[3], protected: isProtected(process.argv[3], set) });
  else done({ protectedBranches: set });
}

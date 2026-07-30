#!/usr/bin/env node
/**
 * commit-review.js — persist the commit-review gate (MBI-141).
 *
 * When a human says "don't autocommit" / "ask before every commit", that must become a DETERMINISTIC,
 * committed setting — not something the agent tries to remember (memory fails: an earlier /ship approval
 * gets rationalized as standing permission and the agent commits anyway). This writes
 * `wall.autoApprove.commit` into the repo-root `.health-harness/project.json` so the wall's commit gate
 * enforces it, and — because it's committed — every git worktree and teammate inherits it.
 *
 * review ON  = wall.autoApprove.commit:false  → the wall ASKs before every commit.
 * review OFF = wall.autoApprove.commit:true   → default (agent commits, you review at the PR).
 *
 * Pure (unit-tested): commitReviewState, withCommitReview. Impure: setCommitReview + enable|disable|status CLI.
 */
'use strict';

/** Pure: 'on' iff commit review is explicitly armed (commit:false); anything else (incl. unset) → 'off'. */
function commitReviewState(project) {
  const v = project && project.wall && project.wall.autoApprove ? project.wall.autoApprove.commit : undefined;
  return v === false ? 'on' : 'off';
}

/** Pure: return a new project object with the commit gate armed (on→commit:false) or disarmed, preserving
 * every other key AND sibling wall.autoApprove flags. */
function withCommitReview(project, on) {
  const j = project ? { ...project } : {};
  const wall = { ...(j.wall || {}) };
  wall.autoApprove = { ...(wall.autoApprove || {}), commit: on ? false : true };
  j.wall = wall;
  return j;
}

// ── impure ─────────────────────────────────────────────────────────────────────
function repoRoot(cwd) {
  try {
    return require('child_process').execSync('git rev-parse --show-toplevel',
      { cwd: cwd || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim() || (cwd || process.cwd());
  } catch { return cwd || process.cwd(); }
}
function projectPath(root) { return require('path').join(root, '.health-harness', 'project.json'); }

/** Impure: arm/disarm the commit gate in the repo-root committed project.json (creates it if absent). */
function setCommitReview(cwd, on) {
  const fs = require('fs'), path = require('path');
  const root = cwd && require('fs').existsSync(path.join(cwd, '.health-harness')) ? cwd : repoRoot(cwd);
  const p = projectPath(root);
  let project = {};
  try { project = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* new file */ }
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(withCommitReview(project, on), null, 2) + '\n');
  return p;
}

module.exports = { commitReviewState, withCommitReview, setCommitReview, repoRoot };

// ── CLI: enable | disable | status ─────────────────────────────────────────────
if (require.main === module) {
  const mode = process.argv[2];
  const root = repoRoot(process.cwd());
  const read = () => { try { return JSON.parse(require('fs').readFileSync(projectPath(root), 'utf8')); } catch { return {}; } };
  if (mode === 'enable') {
    setCommitReview(process.cwd(), true);
    console.log('✓ commit review ARMED (wall.autoApprove.commit:false) — the wall now ASKs before every commit. '
      + 'Committed to project.json, so worktrees + teammates inherit it. Commit it to make it stick for the repo.');
  } else if (mode === 'disable') {
    setCommitReview(process.cwd(), false);
    console.log('✓ commit review OFF (wall.autoApprove.commit:true) — the agent commits as it works; you review at the PR.');
  } else if (mode === 'status') {
    console.log(`commit review: ${commitReviewState(read())}`);
  } else {
    console.log('usage: commit-review.js enable | disable | status   (enable = ASK before every commit)');
  }
}

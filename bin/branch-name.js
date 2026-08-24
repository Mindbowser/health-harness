#!/usr/bin/env node
/**
 * branch-name.js — recommend a consistent branch name at branch-creation, derived from the ticket's issue
 * TYPE + key (MBI-144). The issue type is already known (issue-graph.js records it at /align), and the
 * branch pattern is persisted by git-config.js (MBI-143) — so the name is derivable, not guessed.
 *
 * Posture: infer-and-inform. /tdd shows recommend()'s name and the dev accepts or overrides. A per-repo
 * `git.enforceBranch=true` flag turns conforms() into a wall-DENY on `git checkout -b` / `git switch -c`.
 *
 * All three functions are pure (exported for tests). The CLI wires them to project.json + issue-graph.
 */
'use strict';

// Issue type → branch prefix. Defaults match Mindbowser's house convention (branches are `feature/` and
// `fix/`), NOT a generic bugfix/hotfix scheme — a customer repo overrides via `git.typePrefixes` in
// project.json (e.g. { Bug: 'bugfix', Hotfix: 'hotfix' }). Everything that isn't a defect is feature-work.
const TYPE_PREFIX = { bug: 'fix', defect: 'fix' };
const DEFAULT_PREFIX = 'feature';

/** Pure: free text → a short, safe branch slug (lowercase, hyphenated, punctuation stripped, ≤50 chars). */
function slugify(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50)
    .replace(/-+$/g, '');
}

/** Pure: derive the branch prefix from the issue type, honoring a per-repo override map (keys matched
 * case-insensitively) layered over the MB defaults. */
function typePrefix(issueType, overrides) {
  const map = { ...TYPE_PREFIX };
  for (const [k, v] of Object.entries(overrides || {})) map[String(k).toLowerCase()] = v;
  return map[String(issueType || '').trim().toLowerCase()] || DEFAULT_PREFIX;
}

/** Pure: recommend a branch name for a ticket. The persisted `pattern` decides whether the prefix is
 * type-derived or repo-pinned:
 *  - default (`feature/<KEY>-<slug>`) or a `<type>/…` token → derive the prefix from the issue type;
 *  - a repo that pinned a specific prefix (e.g. `feat/<KEY>-<slug>`) → honor it verbatim (the repo's
 *    established single-prefix convention wins over type-derivation). */
function recommend(issueType, key, description, opts = {}) {
  const pattern = opts.pattern || `${DEFAULT_PREFIX}/<KEY>-<slug>`;
  const pinned = String(pattern).split('/')[0]; // the literal prefix segment of the pattern
  const usesType = pinned === '<type>' || pinned === DEFAULT_PREFIX;
  const prefix = usesType ? typePrefix(issueType, opts.typePrefixes) : pinned;
  return `${prefix}/${key}-${slugify(description)}`;
}

/** Pure: does an existing branch name carry the ticket key behind a prefix segment? Used in enforce mode.
 * Requires `<prefix>/…<KEY>…` — a prefix segment AND the exact key present. */
function conforms(branch, key) {
  const b = String(branch || '');
  if (!b.includes('/')) return false;
  return new RegExp(`\\b${String(key).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(b);
}

module.exports = { recommend, conforms, slugify, typePrefix, TYPE_PREFIX, DEFAULT_PREFIX };

// ── CLI ───────────────────────────────────────────────────────────────────────
//   node branch-name.js recommend <KEY> "<description>" [issueType]
//     → prints the recommended name (issueType/pattern read from issue-graph + project.json when omitted)
//   node branch-name.js conforms <branch> <KEY>   → prints "true"/"false" (exit 0/1)
if (require.main === module) {
  const fs = require('fs'), path = require('path');
  const cwd = process.cwd();
  const readJson = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return {}; } };
  const project = readJson(path.join(cwd, '.health-harness', 'project.json'));
  const pattern = (project.git && project.git.branchPattern) || undefined;
  const typePrefixes = (project.git && project.git.typePrefixes) || undefined;
  const sub = process.argv[2];

  if (sub === 'recommend') {
    const key = process.argv[3];
    const desc = process.argv[4] || '';
    let issueType = process.argv[5];
    if (!issueType && key) { // fall back to what /align recorded in the issue graph (~/.health-harness)
      try { issueType = (require('./issue-graph.js').loadGraph()[key] || {}).type; } catch { /* none */ }
    }
    process.stdout.write(recommend(issueType, key, desc, { pattern, typePrefixes }));
    process.exit(0);
  } else if (sub === 'conforms') {
    const ok = conforms(process.argv[3], process.argv[4]);
    process.stdout.write(String(ok));
    process.exit(ok ? 0 : 1);
  } else {
    process.stdout.write('usage: branch-name.js recommend <KEY> "<description>" [issueType] | conforms <branch> <KEY>\n');
    process.exit(0);
  }
}

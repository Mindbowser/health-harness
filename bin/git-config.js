#!/usr/bin/env node
/**
 * git-config.js — capture + persist a repo's `git` conventions (branch pattern, base, PR target) to
 * `.health-harness/project.json`, the SAME discover-once→confirm→reuse loop as jira-transitions.js.
 *
 * The gap this closes (MBI-143): /tdd is told to read a branch-naming convention from project.json's `git`
 * block and /ship reads jira.transitions — but nothing ever POPULATED the git block, so the convention the
 * skills assume was absent and branch naming fell back to each dev's habit. /start now infers it here,
 * confirms once, and writes it; every later branch (and teammate, since project.json is committed) reuses it.
 *
 * inferBranchPattern() + detectCommitlintMismatch() are pure (exported for tests). The CLI does the I/O:
 *   node git-config.js infer                 # reads `git branch` + the project key → { pattern, needsConfirm }
 *   echo '<git-block>' | node git-config.js write   # merge the confirmed block into project.json → git{}
 *   node git-config.js check-commitlint      # flags an issuePrefixes that can't match the project key
 */
'use strict';

const BASE_BRANCHES = new Set(['main', 'master', 'develop', 'trunk', 'release']);
const DEFAULT_PREFIX = 'feature';

/** Pure: existing branch names + the project key → the branch-naming convention to adopt.
 * A prefix (the segment before the first "/") is adopted only when EVERY non-base branch agrees on it —
 * a unique, unambiguous signal. Zero feature branches or a mix of prefixes → the default + needsConfirm so
 * the skill asks rather than guessing wrong. Returns { prefix, pattern, needsConfirm }. */
function inferBranchPattern(branches, key) {
  const feats = (branches || [])
    .map((b) => String(b || '').replace(/^\*?\s*/, '').trim())
    .filter((b) => b && !BASE_BRANCHES.has(b) && b.includes('/'));
  const prefixes = [...new Set(feats.map((b) => b.slice(0, b.indexOf('/'))).filter(Boolean))];
  if (prefixes.length === 1) {
    const prefix = prefixes[0];
    return { prefix, pattern: `${prefix}/<KEY>-<slug>`, needsConfirm: false };
  }
  return { prefix: DEFAULT_PREFIX, pattern: `${DEFAULT_PREFIX}/<KEY>-<slug>`, needsConfirm: true };
}

/** Pure: a parsed commitlint config (or a bare { issuePrefixes }) + the project key → mismatch report, or
 * null when there is nothing to check (no config / no issuePrefixes). A mismatch = issuePrefixes are set but
 * NONE of them (case-insensitively) matches the project key's "KEY-" token, so the reference parser can never
 * fire (the exact HTX-71 misconfiguration: issuePrefixes ['JIRA-'] on a repo whose keys are HTX-). */
function detectCommitlintMismatch(config, key) {
  const cfg = config || {};
  const prefixes = Array.isArray(cfg.issuePrefixes) ? cfg.issuePrefixes.filter(Boolean) : [];
  if (!prefixes.length) return null;
  const expected = `${String(key || '').toUpperCase()}-`;
  const ok = prefixes.some((p) => String(p).toUpperCase() === expected);
  return { mismatch: !ok, configured: prefixes, expected };
}

module.exports = { inferBranchPattern, detectCommitlintMismatch, BASE_BRANCHES, DEFAULT_PREFIX };

// ── CLI ───────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const fs = require('fs'), path = require('path');
  const { execSync } = require('child_process');
  const sub = process.argv[2];
  const projectPath = path.join(process.cwd(), '.health-harness', 'project.json');
  const readProject = () => { try { return JSON.parse(fs.readFileSync(projectPath, 'utf8')); } catch { return {}; } };
  const done = (o) => { process.stdout.write(JSON.stringify(o)); process.exit(0); };

  if (sub === 'infer') {
    const j = readProject();
    const key = (j.jira && j.jira.projectKey) || '';
    let branches = [];
    try { branches = execSync('git branch --format="%(refname:short)"', { encoding: 'utf8' }).split('\n'); } catch { /* not a git repo */ }
    let base = (j.git && j.git.baseBranch) || 'main';
    try { base = execSync('git symbolic-ref --short refs/remotes/origin/HEAD', { encoding: 'utf8' }).trim().replace(/^origin\//, '') || base; } catch { /* no remote HEAD */ }
    const inferred = inferBranchPattern(branches, key);
    done({ ...inferred, baseBranch: base, prTarget: base, key });
  } else if (sub === 'write') {
    const arg = process.argv[3];
    let raw = arg || '';
    const finish = () => {
      let block; try { block = JSON.parse(raw || '{}'); } catch { return done({ error: 'bad-json' }); }
      const j = readProject();
      j.git = { ...(j.git || {}), ...(block.git || block) };
      // keep the top-level defaultBranch mirror in sync (some readers use it)
      if (j.git.baseBranch) j.defaultBranch = j.git.baseBranch;
      try { fs.mkdirSync(path.dirname(projectPath), { recursive: true }); fs.writeFileSync(projectPath, JSON.stringify(j, null, 2) + '\n'); } catch (e) { return done({ error: e.message }); }
      done({ ok: true, git: j.git });
    };
    if (arg) finish();
    else { process.stdin.on('data', (c) => { raw += c; }); process.stdin.on('end', finish); setTimeout(finish, 300); }
  } else if (sub === 'check-commitlint') {
    const j = readProject();
    const key = (j.jira && j.jira.projectKey) || '';
    // read issuePrefixes from a commitlint config if one exists (JS config → require; JSON → parse)
    let cfg = null;
    for (const f of ['commitlint.config.js', '.commitlintrc.js', '.commitlintrc.json', '.commitlintrc']) {
      const p = path.join(process.cwd(), f);
      if (!fs.existsSync(p)) continue;
      try {
        const loaded = f.endsWith('.js') ? require(p) : JSON.parse(fs.readFileSync(p, 'utf8'));
        const opts = (loaded.parserPreset && loaded.parserPreset.parserOpts) || loaded.parserOpts || loaded;
        cfg = { issuePrefixes: opts.issuePrefixes };
      } catch { /* unreadable config → skip */ }
      break;
    }
    done(detectCommitlintMismatch(cfg, key) || { mismatch: false, configured: [], expected: `${String(key).toUpperCase()}-` });
  } else {
    process.stdout.write('usage: git-config.js infer | write <git-block-json> | check-commitlint\n');
    process.exit(0);
  }
}

#!/usr/bin/env node
/**
 * diff-summary.js — a compact, readable summary of what a push is about to send (MBI-153).
 *
 * Feeds the diff-review-before-push gate so a dev sees what is leaving instead of pushing blind.
 * Everything here is PURE over `git diff --numstat` text, so it is testable without a repo; the CLI
 * shells out. isNonInteractive() is the guard that keeps the review from ever blocking CI/AFK — an ASK
 * nobody can answer would deadlock the build loop.
 */
'use strict';

// Standard CI markers. A value of exactly "false" is treated as NOT CI (some shells export CI=false).
const CI_VARS = ['CI', 'CONTINUOUS_INTEGRATION', 'GITHUB_ACTIONS', 'GITLAB_CI', 'JENKINS_URL', 'BUILDKITE', 'CIRCLECI', 'TF_BUILD'];

/** Pure: is this a non-interactive (CI/automation) environment? No human ⇒ never ASK. */
function isNonInteractive(env) {
  const e = env || {};
  return CI_VARS.some((k) => {
    const v = e[k];
    return v !== undefined && v !== '' && String(v).toLowerCase() !== 'false';
  });
}

/** Pure: `git diff --numstat` text → [{file, added, removed, binary}]. Binary files report "-" counts. */
function parseNumstat(text) {
  return String(text || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const m = l.match(/^(\S+)\s+(\S+)\s+(.+)$/);
      if (!m) return null;
      const binary = m[1] === '-' || m[2] === '-';
      return { file: m[3], added: binary ? 0 : parseInt(m[1], 10) || 0, removed: binary ? 0 : parseInt(m[2], 10) || 0, binary };
    })
    .filter(Boolean);
}

/** Pure: totals across parsed entries. */
function summarize(entries) {
  const e = entries || [];
  return {
    files: e.length,
    added: e.reduce((n, x) => n + x.added, 0),
    removed: e.reduce((n, x) => n + x.removed, 0),
  };
}

/** Pure: a short human-readable summary — biggest changes first, truncated so a large push stays
 * skimmable rather than dumping hundreds of lines into a prompt. */
function formatSummary(entries, opts) {
  const max = (opts && opts.max) || 10;
  const e = [...(entries || [])].sort((a, b) => (b.added + b.removed) - (a.added + a.removed));
  const t = summarize(e);
  const shown = e.slice(0, max);
  const lines = shown.map((x) => `  ${x.binary ? '(binary)' : `+${x.added} -${x.removed}`}  ${x.file}`);
  const rest = e.length - shown.length;
  if (rest > 0) lines.push(`  … and ${rest} more file${rest > 1 ? 's' : ''}`);
  return [`${t.files} file${t.files === 1 ? '' : 's'} changed, +${t.added} -${t.removed}`, ...lines].join('\n');
}

/** Pure: walk a unified diff and return every ADDED line as {file, line, text} (new-file line numbers).
 * ONE implementation shared by the secret scanner and the pre-commit checks — gating on what a change
 * INTRODUCES (never pre-existing code) is the rule both rely on, so it must not drift between them. */
function addedLines(diff) {
  const out = [];
  let file = null, newLine = 0;
  String(diff || '').split(/\r?\n/).forEach((raw) => {
    if (raw.startsWith('+++ ')) {                 // destination-file header (before the '+' test)
      const m = raw.match(/^\+\+\+\s+(?:b\/)?(.+?)\s*$/);
      file = m && m[1] !== '/dev/null' ? m[1] : null;
      return;
    }
    if (raw.startsWith('--- ')) return;           // old-file header
    const hunk = raw.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) { newLine = parseInt(hunk[1], 10); return; }
    if (raw.startsWith('+')) { out.push({ file, line: newLine, text: raw.slice(1) }); newLine++; return; }
    if (raw.startsWith('-')) return;              // removed → new-file counter does not advance
    newLine++;                                    // context / blank
  });
  return out;
}

module.exports = { parseNumstat, summarize, formatSummary, isNonInteractive, addedLines, CI_VARS };

// ── CLI ─────────────────────────────────────────────────────────────────────
//   diff-summary.js [<range>]   → print the summary for a range (default: vs upstream, else last commit)
if (require.main === module) {
  const { execSync } = require('child_process');
  const run = (c) => execSync(c, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
  const range = process.argv[2];
  let text = '';
  try { text = run(`git diff --numstat ${range || '@{upstream}..HEAD'}`); }
  catch { try { text = run('git diff --numstat HEAD~1..HEAD'); } catch { text = ''; } }
  process.stdout.write(formatSummary(parseNumstat(text)) + '\n');
}

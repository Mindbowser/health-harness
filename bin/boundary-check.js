#!/usr/bin/env node
/**
 * boundary-check.js — module-boundary guard (MBI-124).
 *
 * A ticket can declare the files/dirs it's expected to touch (`boundaries: [globs]` in its committed
 * criteria manifest, `.health-harness/criteria/<KEY>.json`). The wall then ASKs before an edit — or a
 * mutating Bash command (rm/mv/sed -i/redirect/git rm) — lands OUTSIDE that list, so "Claude modified/
 * deleted a file it shouldn't" can't happen silently. Approving promotes the file INTO the boundary list
 * (a living list, PostToolUse `record`) so it isn't asked again — the manifest becomes an accurate record
 * of everything the ticket touched.
 *
 * Opt-in: no `boundaries` declared → dormant (behaviour unchanged). The active ticket is resolved from the
 * branch name (feature/MBI-124-… → MBI-124), reusing the criteria-manifest convention.
 *
 * Pure core (unit-tested): matchesGlob, pathInBoundaries, boundaryDecision, editTargets, bashTargets.
 * Impure: repoRoot, activeKey, loadBoundaries, recordBoundary, and the PostToolUse `record` CLI.
 */
'use strict';

/** Pure: does a repo-relative path match a single glob? `**` spans path segments, `*`/`?` stay within one. */
function matchesGlob(filePath, glob) {
  const norm = (s) => String(s || '').replace(/^\.\//, '').replace(/^\/+/, '');
  const p = norm(filePath);
  const g = norm(glob);
  // Build a regex: ** → any chars (incl. /), * → any chars except /, ? → one non-/ char. Escape the rest.
  let re = '';
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') { re += '.*'; i++; if (g[i + 1] === '/') i++; } // `**/` and `**` both → .*
      else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$').test(p);
}

/** Pure: is the path inside ANY of the boundary globs? */
function pathInBoundaries(filePath, boundaries) {
  const list = Array.isArray(boundaries) ? boundaries : [];
  return list.some((g) => matchesGlob(filePath, g));
}

/** Pure: null when dormant (no boundaries) or in-bounds; else { out:true, path } for an out-of-bounds edit. */
function boundaryDecision(filePath, boundaries) {
  const list = Array.isArray(boundaries) ? boundaries.filter(Boolean) : [];
  if (list.length === 0) return null;             // opt-in: nothing declared → dormant (AC-3)
  if (!filePath) return null;
  if (pathInBoundaries(filePath, list)) return null;
  return { out: true, path: String(filePath) };
}

/** Pure: the file paths an Edit/Write/MultiEdit call targets (else []). */
function editTargets(toolName, toolInput) {
  if (!/^(Edit|Write|MultiEdit)$/.test(String(toolName || ''))) return [];
  const fp = (toolInput || {}).file_path;
  return fp ? [String(fp)] : [];
}

/** Pure: best-effort file targets of a MUTATING bash command (rm/mv/cp/sed -i/redirect/git rm|mv). Read-only
 * commands yield []. Heuristic by design — it catches the common destructive shapes, not every possible one. */
function bashTargets(command) {
  const cmd = String(command || '');
  const out = new Set();
  const looksPath = (t) => t && !t.startsWith('-') && /[./]/.test(t) && !/[|&;<>]/.test(t);
  const tokens = cmd.match(/"[^"]*"|'[^']*'|\S+/g) || [];
  const unquote = (t) => t.replace(/^['"]|['"]$/g, '');

  // rm / git rm — every path-looking arg after the verb
  let m = cmd.match(/\b(?:git\s+)?rm\b([^\n|&;]*)/i);
  if (m) m[1].trim().split(/\s+/).forEach((t) => { const u = unquote(t); if (looksPath(u)) out.add(u); });
  // git mv / mv / cp — path-looking args
  m = cmd.match(/\b(?:git\s+)?(?:mv|cp)\b([^\n|&;]*)/i);
  if (m) m[1].trim().split(/\s+/).forEach((t) => { const u = unquote(t); if (looksPath(u)) out.add(u); });
  // sed -i … FILE — path-looking tokens, EXCLUDING the sed script itself (MBI-133). A sed substitution/
  // transform (`s/a/b/`, `y/a/b/`) is a command letter immediately followed by a `/` or `,` delimiter — a
  // real path never has a delimiter right after its FIRST character (`src/…` has `sr…`, `/Users/…` leads
  // with `/` and no command letter). Requiring the leading letter keeps absolute paths as valid targets.
  const isSedScript = (t) => /^\d*[a-z]['"]?[/,]/.test(t);
  if (/\bsed\b[^\n]*\s-i\b/.test(cmd)) tokens.map(unquote).filter((t) => looksPath(t) && !isSedScript(t)).forEach((u) => out.add(u));
  // output redirects  > file  or  >> file
  let r; const redir = /(?:>>?|\btee\b)\s*("[^"]+"|'[^']+'|\S+)/g;
  while ((r = redir.exec(cmd))) { const u = unquote(r[1]); if (looksPath(u)) out.add(u); }

  return [...out];
}

// ── impure resolution (active ticket + its boundaries) ────────────────────────
function repoRoot(cwd) {
  try {
    return require('child_process').execSync('git rev-parse --show-toplevel',
      { cwd: cwd || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim() || null;
  } catch { return null; }
}
/** The Jira key on the current branch (feature/MBI-124-… → MBI-124), or null. */
function activeKey(cwd) {
  try {
    const b = require('child_process').execSync('git rev-parse --abbrev-ref HEAD',
      { cwd: cwd || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    const m = b.match(/[A-Z][A-Z0-9]+-\d+/);
    return m ? m[0] : null;
  } catch { return null; }
}
function manifestPath(root, key) {
  return require('path').join(root, '.health-harness', 'criteria', `${key}.json`);
}
/** The active ticket's declared boundary globs ([] when none/dormant). One git call resolves both root +
 * branch (this runs on every edit, so keep it cheap); a missing/boundary-less manifest → dormant. */
function loadBoundaries(cwd) {
  let root = null, key = null;
  try {
    const out = require('child_process').execSync('git rev-parse --show-toplevel --abbrev-ref HEAD',
      { cwd: cwd || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim().split('\n');
    root = (out[0] || '').trim() || null;
    const m = (out[1] || '').match(/[A-Z][A-Z0-9]+-\d+/);
    key = m ? m[0] : null;
  } catch { /* not a git repo → dormant */ }
  if (!root || !key) return { root, key, boundaries: [] };
  try {
    const j = JSON.parse(require('fs').readFileSync(manifestPath(root, key), 'utf8'));
    return { root, key, boundaries: Array.isArray(j.boundaries) ? j.boundaries.filter(Boolean) : [] };
  } catch { return { root, key, boundaries: [] }; }
}
/** Make a path repo-relative (so it matches the globs), given the repo root. */
function relPath(root, filePath) {
  const path = require('path');
  if (!filePath) return filePath;
  const abs = path.isAbsolute(filePath) ? filePath : path.resolve(root || process.cwd(), filePath);
  const rel = path.relative(root || process.cwd(), abs);
  return rel.split(path.sep).join('/');
}
/** Living list: append a now-approved out-of-bounds file to the manifest's boundaries (idempotent). Only
 * runs when the feature is already active (boundaries non-empty) — never auto-populates a dormant ticket. */
function recordBoundary(cwd, filePath) {
  const fs = require('fs');
  const { root, key, boundaries } = loadBoundaries(cwd);
  if (!root || !key || boundaries.length === 0) return false; // dormant → do nothing
  const rel = relPath(root, filePath);
  if (!rel || pathInBoundaries(rel, boundaries)) return false;
  const p = manifestPath(root, key);
  let j; try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return false; }
  j.boundaries = [...boundaries, rel];
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  return true;
}

/** Impure: declare the boundary globs for a ticket (used by /align). Writes/updates .boundaries on the
 * committed manifest, preserving criteria; creates the manifest if absent. Returns the normalized list. */
function setBoundaries(cwd, key, globs) {
  const fs = require('fs'), path = require('path');
  const root = repoRoot(cwd) || cwd || process.cwd();
  const list = (Array.isArray(globs) ? globs : String(globs || '').split(',')).map((g) => String(g).trim()).filter(Boolean);
  const dir = path.join(root, '.health-harness', 'criteria');
  fs.mkdirSync(dir, { recursive: true });
  const p = path.join(dir, `${key}.json`);
  let j = { issueKey: key, criteria: [] };
  try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* new manifest */ }
  j.boundaries = list;
  fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n');
  return list;
}

/** Impure convenience for the wall: resolve boundaries + a tool call → an out-of-bounds path, or null. */
function checkToolCall(toolName, toolInput, cwd) {
  const { root, boundaries } = loadBoundaries(cwd);
  if (boundaries.length === 0) return null; // dormant
  const raw = toolName === 'Bash' ? bashTargets((toolInput || {}).command) : editTargets(toolName, toolInput);
  for (const t of raw) {
    const d = boundaryDecision(relPath(root, t), boundaries);
    if (d) return d; // first out-of-bounds target
  }
  return null;
}

module.exports = {
  matchesGlob, pathInBoundaries, boundaryDecision, editTargets, bashTargets,
  repoRoot, activeKey, loadBoundaries, relPath, recordBoundary, setBoundaries, checkToolCall,
};

// ── PostToolUse CLI: `record` — promote an approved out-of-bounds edit into the boundary list ─────────────
if (require.main === module) {
  const mode = process.argv[2];
  if (mode === 'record') {
    let raw = '';
    process.stdin.on('data', (c) => { raw += c; });
    process.stdin.on('end', () => {
      try {
        const input = JSON.parse(raw || '{}');
        const tool = input.tool_name;
        const targets = tool === 'Bash' ? bashTargets((input.tool_input || {}).command) : editTargets(tool, input.tool_input);
        for (const t of targets) recordBoundary(process.cwd(), t);
      } catch { /* never block on record */ }
      process.exit(0);
    });
  } else if (mode === 'set') {
    // set <KEY> "glob1,glob2"  — /align declares the ticket's boundaries and echoes them for the dev to see
    const key = process.argv[3];
    const list = setBoundaries(process.cwd(), key, process.argv[4] || '');
    console.log(list.length
      ? `Boundaries for ${key}: ${list.join(', ')}\nEdits/deletes outside these will pause for approval (approve → the file is added to the list).`
      : `Boundaries for ${key} cleared — the guard is dormant for this ticket.`);
    process.exit(0);
  } else if (mode === 'list') {
    // list — show the active ticket's current boundaries (what the wall is enforcing right now)
    const { key, boundaries } = loadBoundaries(process.cwd());
    console.log(!key ? 'No ticket on this branch.'
      : boundaries.length ? `Boundaries for ${key}: ${boundaries.join(', ')}` : `No boundaries declared for ${key} (guard dormant).`);
    process.exit(0);
  } else {
    process.exit(0);
  }
}

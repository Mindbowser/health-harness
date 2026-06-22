#!/usr/bin/env node
/**
 * usage-log.js — metadata-only usage events for the coaching feature (PRD: docs/usage-coaching-prd.md).
 *
 * Appends one JSON line per event to ~/.health-harness/usage/<YYYY-MM-DD>.jsonl. **Metadata ONLY** — a
 * per-event field allowlist drops everything else, so code/prompts/file-contents/PHI can never land here.
 * Fire-and-forget: never throws, always exits 0.
 *
 * Used two ways:
 *   - in-process: require() it and call appendEvent(event, data) (from session-context.js, outward-guard.js)
 *   - as a hook: `node usage-log.js <hookType>` reads the hook's stdin JSON → events → append
 */
'use strict';

// Per-event field allowlist. Anything not listed is dropped — the privacy guarantee, enforced in code.
const ALLOW = {
  session_start: [],
  tool: ['tool', 'ok'],
  edit: ['ext'],
  gate_run: ['result'],
  command: ['name', 'issueKey'],
  wall: ['action', 'why'],
  user_reject: [], interrupt: [], revert: [], correction: [],
  prompt: ['lenBucket', 'hasContext', 'issueKey'],
  prompt_quality: ['score', 'flags'],
  commit: ['sizeBucket', 'branchKind'],
  redaction: ['hits'],
  // best-practice / hygiene signals (emitted by skills via the `emit` CLI; metadata only)
  breaking_change: ['kind', 'confirmed', 'issueKey'],
  migration: ['pattern', 'issueKey'],
  migration_gap: ['reason'],
  test_strength: ['kind', 'score'],   // kind=mutation|property; score = mutation %, cheap/CI-ingested
  coverage_drop: ['delta'],           // coverage points dropped
  dep_hygiene: ['kind', 'count'],     // kind=stale|unpinned|major|vuln
  compaction: [], subagent: [],
};

// keep only allowlisted, scalar fields (no nested objects/content)
function sanitize(event, data) {
  const allow = ALLOW[event];
  if (!allow) return null; // unknown event → drop entirely
  const out = {};
  for (const k of allow) {
    const v = (data || {})[k];
    if (v === undefined || v === null) continue;
    if (typeof v === 'object') continue; // never store structured content
    out[k] = typeof v === 'string' ? v.slice(0, 40) : v; // cap string length defensively
  }
  return out;
}

const GATE_RE = /\b(npm (run )?(test|lint|build|typecheck)|yarn (test|lint)|pnpm (test|lint)|jest|vitest|pytest|go test|gradle|mvn|tsc|eslint|make( test| ci)?)\b/i;
// committing AI work (small-steps signal) vs reverting it (an "objecting" / hard-harnessing signal)
const COMMIT_RE = /\bgit\s+commit\b/i;
const REVERT_RE = /\bgit\s+(revert\b|reset\s+--hard\b|checkout\s+(--?|HEAD|[0-9a-f]{7,})|restore\b|clean\s+-[a-z]*f)/i;

/** Pure: parse a slash-command name from raw prompt/command text. Strips the leading '/' and any plugin
 * namespace ("health-harness:align" → "align"). Never returns the args. '' if not a command. */
function commandName(text) {
  const t = String(text || '').trim();
  if (!t.startsWith('/')) return '';
  const first = t.replace(/^\//, '').split(/\s+/)[0] || '';
  return first.split(':').pop();
}
/** Pure: extract a Jira/Linear issue key (e.g. ACME-258) from text — a non-sensitive identifier used to
 * group work by ticket (Atlas joins it to Jira for type/priority/severity). '' if none. */
const ISSUE_RE = /\b[A-Z][A-Z0-9]+-\d+\b/;
function issueKey(text) { const m = String(text || '').match(ISSUE_RE); return m ? m[0] : ''; }
/** Pure: bucket a prompt's length without storing it. */
function lenBucket(len) { return len < 80 ? 's' : len < 400 ? 'm' : 'l'; }
/** Pure: does the prompt carry intent-sharpening context (a file ref, a ticket id, or an @mention)? */
function hasContextMarkers(text) {
  const t = String(text || '');
  return /[\w./-]+\.[a-z]{1,8}\b/i.test(t) || /\b[A-Z]{2,}-\d+\b/.test(t) || /(^|\s)@[\w./-]+/.test(t);
}

/** Pure: map a hook's stdin payload to zero+ {event,data} records. */
function eventsFromHook(hookType, input) {
  const inp = input || {};
  const out = [];
  if (hookType === 'posttooluse' || hookType === 'posttoolfail') {
    const ok = hookType === 'posttooluse';
    const tool = String(inp.tool_name || '');
    out.push({ event: 'tool', data: { tool, ok } });
    if (/^(Edit|Write|MultiEdit)$/.test(tool)) {
      const fp = String((inp.tool_input || {}).file_path || '');
      const ext = fp.includes('.') ? fp.split('.').pop().slice(0, 8) : '';
      if (ext) out.push({ event: 'edit', data: { ext } });
    }
    if (tool === 'Bash') {
      const cmd = String((inp.tool_input || {}).command || '');
      if (GATE_RE.test(cmd)) out.push({ event: 'gate_run', data: { result: ok ? 'pass' : 'fail' } });
      if (ok && COMMIT_RE.test(cmd)) out.push({ event: 'commit', data: {} }); // branchKind/sizeBucket enriched in entry
      if (ok && REVERT_RE.test(cmd)) out.push({ event: 'revert', data: {} });
    }
  } else if (hookType === 'userpromptsubmit') {
    // The raw user turn. Metadata only: length bucket + a context flag, never the text. A leading '/'
    // also yields a command event (align/tdd adoption — feeds the "align before code" dimension).
    const text = String(inp.prompt || inp.user_prompt || '');
    const name = commandName(text);
    const key = issueKey(text); // the Jira ticket the work is on (for per-issue / by-type slicing)
    if (name) out.push({ event: 'command', data: { name, ...(key ? { issueKey: key } : {}) } });
    out.push({ event: 'prompt', data: { lenBucket: lenBucket(text.length), hasContext: hasContextMarkers(text), ...(key ? { issueKey: key } : {}) } });
  } else if (hookType === 'command') {
    // legacy/explicit command hook (kept for back-compat). Never store the args.
    const name = commandName(String(inp.command || inp.name || ''));
    if (name) out.push({ event: 'command', data: { name } });
  } else if (hookType === 'precompact') {
    out.push({ event: 'compaction', data: {} });
  } else if (hookType === 'subagentstop') {
    out.push({ event: 'subagent', data: {} });
  }
  return out;
}

/** Impure: enrich a commit event with branchKind + sizeBucket from git (PostToolUse fires after the
 * commit succeeded, so HEAD is the new commit). Best-effort — returns data unchanged on any failure. */
function enrichCommit(data) {
  try {
    const { execSync } = require('child_process');
    const run = (c) => execSync(c, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    const branch = run('git rev-parse --abbrev-ref HEAD');
    const out = { ...data };
    if (branch) out.branchKind = /^(main|master|develop|release.*)$/i.test(branch) ? 'base' : 'feature';
    const n = parseInt(run('git show --stat --format="" HEAD | tail -1 | grep -oE "[0-9]+ insertion" | grep -oE "[0-9]+"') || '0', 10) || 0;
    out.sizeBucket = n < 25 ? 's' : n < 150 ? 'm' : 'l';
    return out;
  } catch { return data; }
}

module.exports = { eventsFromHook, sanitize, ALLOW, GATE_RE, appendEvent, gitEmail, usageDir,
  commandName, lenBucket, hasContextMarkers, enrichCommit, harnessVersion, issueKey, parseKv };

// ── writer ────────────────────────────────────────────────────────────────────
function usageDir() {
  const os = require('os'), path = require('path');
  return path.join(os.homedir(), '.health-harness', 'usage');
}
let _email; // memoize
function gitEmail() {
  if (_email !== undefined) return _email;
  try {
    _email = require('child_process').execSync('git config user.email', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim() || null;
  } catch { _email = null; }
  return _email;
}
let _ver; // memoize the installed harness version (stamped on every record for cohort/version analysis)
function harnessVersion() {
  if (_ver !== undefined) return _ver;
  try {
    _ver = require('../.claude-plugin/plugin.json').version || null;
  } catch { _ver = null; }
  return _ver;
}
function appendEvent(event, data) {
  try {
    const fs = require('fs'), path = require('path');
    const clean = sanitize(event, data);
    if (!clean) return;
    const now = new Date();
    const dir = usageDir();
    fs.mkdirSync(dir, { recursive: true });
    const rec = { v: 1, ts: now.toISOString(), userId: gitEmail(), repoId: repoId(), hv: harnessVersion(), event, ...clean };
    fs.appendFileSync(path.join(dir, `${now.toISOString().slice(0, 10)}.jsonl`), JSON.stringify(rec) + '\n');
  } catch { /* fire-and-forget */ }
}
function repoId() {
  try {
    const top = require('child_process').execSync('git rev-parse --show-toplevel', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    return top ? require('path').basename(top) : null;
  } catch { return null; }
}

/** Pure: parse `k=v` CLI args into a data object, coercing true/false and plain numbers. */
function parseKv(args) {
  const out = {};
  for (const a of args || []) {
    const i = String(a).indexOf('=');
    if (i <= 0) continue;
    const k = a.slice(0, i), v = a.slice(i + 1);
    out[k] = v === 'true' ? true : v === 'false' ? false : /^-?\d+(\.\d+)?$/.test(v) ? Number(v) : v;
  }
  return out;
}

// ── hook entry ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const hookType = process.argv[2] || '';
  // `emit` subcommand — skills record a metadata-only signal: usage-log.js emit <event> k=v …
  // (allowlist still applies via appendEvent→sanitize, so non-allowed fields are dropped.)
  if (hookType === 'emit') {
    try { appendEvent(process.argv[3] || '', parseKv(process.argv.slice(4))); } catch { /* ignore */ }
    process.exit(0);
  }
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  const go = () => {
    try {
      const input = raw ? JSON.parse(raw) : {};
      for (const e of eventsFromHook(hookType, input)) {
        appendEvent(e.event, e.event === 'commit' ? enrichCommit(e.data) : e.data);
      }
    } catch { /* defer */ }
    process.exit(0);
  };
  process.stdin.on('end', go);
  setTimeout(go, 300); // don't hang if no stdin
}

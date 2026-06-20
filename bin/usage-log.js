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
  command: ['name'],
  wall: ['action', 'why'],
  user_reject: [], interrupt: [], revert: [], correction: [],
  prompt: ['lenBucket', 'hasContext'],
  prompt_quality: ['score', 'flags'],
  commit: ['sizeBucket', 'branchKind'],
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
    }
  } else if (hookType === 'command') {
    // UserPromptExpansion → which skill/command was invoked. First token = command; strip any plugin
    // namespace ("health-harness:align" → "align"). Never store the args.
    const first = String(inp.command || inp.name || '').replace(/^\//, '').trim().split(/\s+/)[0] || '';
    const name = first.split(':').pop();
    if (name) out.push({ event: 'command', data: { name } });
  }
  return out;
}

module.exports = { eventsFromHook, sanitize, ALLOW, GATE_RE, appendEvent, gitEmail, usageDir };

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
function appendEvent(event, data) {
  try {
    const fs = require('fs'), path = require('path');
    const clean = sanitize(event, data);
    if (!clean) return;
    const now = new Date();
    const dir = usageDir();
    fs.mkdirSync(dir, { recursive: true });
    const rec = { v: 1, ts: now.toISOString(), userId: gitEmail(), repoId: repoId(), event, ...clean };
    fs.appendFileSync(path.join(dir, `${now.toISOString().slice(0, 10)}.jsonl`), JSON.stringify(rec) + '\n');
  } catch { /* fire-and-forget */ }
}
function repoId() {
  try {
    const top = require('child_process').execSync('git rev-parse --show-toplevel', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    return top ? require('path').basename(top) : null;
  } catch { return null; }
}

// ── hook entry ──────────────────────────────────────────────────────────────────
if (require.main === module) {
  const hookType = process.argv[2] || '';
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  const go = () => {
    try {
      const input = raw ? JSON.parse(raw) : {};
      for (const e of eventsFromHook(hookType, input)) appendEvent(e.event, e.data);
    } catch { /* defer */ }
    process.exit(0);
  };
  process.stdin.on('end', go);
  setTimeout(go, 300); // don't hang if no stdin
}

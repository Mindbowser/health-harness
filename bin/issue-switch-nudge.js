#!/usr/bin/env node
/**
 * issue-switch-nudge.js — nudge the user to start a CLEAN session when they bring an UNRELATED new ticket
 * into a session that's already carrying a lot of context. Long context that's irrelevant to the new issue
 * hurts both quality (attention degrades / the model anchors on stale work) and cost (the whole history is
 * re-billed every turn). See README "Smart-zone reminder".
 *
 * NOT a standalone hook — to stay cheap it is CALLED IN-PROCESS from the existing UserPromptSubmit hook
 * (usage-log.js), so there's no extra process spawn per turn. evaluate() short-circuits hard:
 *   - no issue key in the prompt          → return null   (the common case; a regex + done)
 *   - the key matches the session anchor   → return null   (you're continuing; NO transcript read)
 *   - a different key, already handled      → return null   (a Set lookup; once-per-ticket only)
 *   - a NEW different key                   → read the transcript tail for context size, log + maybe nudge
 * So the only non-trivial work (a ~64KB tail read) happens at most once per distinct new ticket per session.
 *
 * Opt out: HARNESS_ISSUE_NUDGE=off. Tune: HARNESS_ISSUE_NUDGE_TOKENS (default 60000).
 */
'use strict';

const DEFAULT_THRESHOLD_TOKENS = 60000;

/** Pure: live context size from a transcript `message.usage` object = what you pay PER turn. Cache reads
 * count — they're still context the model processes. Output tokens don't (they're not re-sent). */
function contextTokens(usage) {
  const u = usage || {};
  return (Number(u.input_tokens) || 0)
    + (Number(u.cache_read_input_tokens) || 0)
    + (Number(u.cache_creation_input_tokens) || 0);
}

/** Pure: coarse size bucket for telemetry (never the raw number). */
function tokenBucket(n) {
  return n < 20000 ? 's' : n < 60000 ? 'm' : n < 120000 ? 'l' : 'xl';
}

/** Pure: scan transcript JSONL text (typically just the tail) for the LAST line carrying message.usage and
 * return its context size. 0 if none parse — a fresh session legitimately has no assistant turn yet. */
function tokensFromTranscriptText(text) {
  const lines = String(text || '').split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const l = lines[i].trim();
    if (!l) continue;
    try { const o = JSON.parse(l); if (o && o.message && o.message.usage) return contextTokens(o.message.usage); } catch { /* partial/!usage */ }
  }
  return 0;
}

/** Pure: the user-facing reminder. Shown locally only (never uploaded), so naming the tickets is fine. */
function nudgeMessage(anchor, key, tokens) {
  const k = Math.round(tokens / 1000);
  return `💡 New ticket in a heavy session — you're bringing up *${key}* but this session has been on `
    + `*${anchor}* and is carrying ~${k}k tokens of context. For unrelated work, a fresh session (start a `
    + `new one, or /clear) gives cleaner context and cheaper turns. Stay here only if ${key} is closely `
    + `related to ${anchor}.`;
}

/** Impure: read the last ~64KB of the transcript for the current context size. Bounded + best-effort, so a
 * huge transcript costs the same as a small one and a missing file never throws. */
function readContextTokens(transcriptPath) {
  try {
    const fs = require('fs');
    const size = fs.statSync(transcriptPath).size;
    const want = Math.min(size, 64 * 1024);
    const fd = fs.openSync(transcriptPath, 'r');
    const buf = Buffer.alloc(want);
    fs.readSync(fd, buf, 0, want, size - want);
    fs.closeSync(fd);
    return tokensFromTranscriptText(buf.toString('utf8'));
  } catch { return 0; }
}

function sessionsDir() {
  const os = require('os'), path = require('path');
  return path.join(os.homedir(), '.health-harness', 'sessions');
}

/** Impure: decide whether to nudge for this prompt, recording the switch as metadata-only telemetry. Returns
 * the nudge string (to surface to the user) or null. Never throws. */
function evaluate(opts) {
  try {
    if (String(process.env.HARNESS_ISSUE_NUDGE || '').toLowerCase() === 'off') return null;
    const { issueKey, appendEvent } = require('./usage-log.js');
    const key = issueKey(opts && opts.prompt);
    const sid = opts && opts.sessionId;
    if (!key || !sid) return null; // nothing to track — the common, near-free path

    const fs = require('fs'), path = require('path');
    const dir = sessionsDir();
    const file = path.join(dir, String(sid).replace(/[^\w.-]/g, '_') + '.json');
    let state = {};
    try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* new session */ }

    if (!state.anchor) { // first ticket this session becomes the anchor — no nudge, set & done
      try { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ anchor: key, switched: [] })); } catch { /* ignore */ }
      pruneOldSessions(dir); // once-per-session housekeeping, off the hot path
      return null;
    }
    if (key === state.anchor) return null;                 // continuing — cheap exit, NO transcript read
    if ((state.switched || []).includes(key)) return null; // already handled this switch — stay silent

    // a genuinely new, different ticket → the ONE place we read the transcript
    const tokens = readContextTokens(opts.transcriptPath);
    const threshold = Number(opts.threshold) || parseInt(process.env.HARNESS_ISSUE_NUDGE_TOKENS, 10) || DEFAULT_THRESHOLD_TOKENS;
    const nudged = tokens >= threshold;
    try { appendEvent('issue_switch', { contextBucket: tokenBucket(tokens), nudged }); } catch { /* ignore */ }
    try { fs.writeFileSync(file, JSON.stringify({ ...state, switched: [...(state.switched || []), key] })); } catch { /* ignore */ }
    return nudged ? nudgeMessage(state.anchor, key, tokens) : null;
  } catch { return null; }
}

/** Impure: drop session state files older than 7 days so the dir can't grow unbounded. Best-effort. */
function pruneOldSessions(dir) {
  try {
    const fs = require('fs'), path = require('path');
    const cutoff = Date.now() - 7 * 86400 * 1000;
    for (const n of fs.readdirSync(dir)) {
      const p = path.join(dir, n);
      try { if (fs.statSync(p).mtimeMs < cutoff) fs.unlinkSync(p); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

module.exports = { evaluate, contextTokens, tokenBucket, tokensFromTranscriptText, nudgeMessage, DEFAULT_THRESHOLD_TOKENS };

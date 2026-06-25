#!/usr/bin/env node
/**
 * ticketless-nudge.js — a soft, passive, once-per-session reminder when work (an Edit/Write) starts in a
 * session with NO Jira ticket linked. It does NOT block — it's a heads-up so the work lands on-board (and
 * so the dev links a ticket before the commit gate ASKs). The hard enforcement is the commit gate
 * (requireTicket, in outward-guard.js); this is the gentle early warning driven by the SAME flag.
 *
 * "Off-board work" needs no new telemetry event: it's the absence of `issueKey` on the existing
 * commit/gate_run/test_change events.
 *
 * evaluate() is pure (the criteria live here); maybeNudge() is the thin hook wiring.
 */
'use strict';

/** Pure: should we show the reminder? message string, or null. Silent unless work has started ticketless.
 *  o = { branchKey, sessionKeys, edited, requireTicket, alreadyWarned } */
function evaluate(o) {
  o = o || {};
  if (o.requireTicket === false) return null;                 // repo opted out — same flag as the commit gate
  if (!o.edited) return null;                                 // Q&A-only session, no work yet → never fire
  if (o.alreadyWarned) return null;                           // once per session
  if (o.branchKey) return null;                               // ticket is on the branch → linked
  if (Array.isArray(o.sessionKeys) && o.sessionKeys.length) return null; // a ticket was referenced this session
  return nudgeMessage();
}

/** Pure: the one-line passive reminder. */
function nudgeMessage() {
  return '⚠ No Jira ticket linked to this work — name the branch `feature/ABC-123-…` or mention the ticket '
    + 'so it lands on-board. (Commits require a ticket; override per-commit, or set commit.requireTicket=false.)';
}

// ── thin wiring (impure) ──────────────────────────────────────────────────────
const ISSUE_RE = /\b[A-Z][A-Z0-9]+-\d+\b/;
function branchKey() {
  try {
    const b = require('child_process').execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    const m = b.match(ISSUE_RE); return m ? m[0] : '';
  } catch { return ''; }
}
function requireTicketOn(cwd) {
  try {
    const fs = require('fs'), path = require('path');
    const j = JSON.parse(fs.readFileSync(path.join(cwd || process.cwd(), '.health-harness', 'project.json'), 'utf8'));
    return !(j.commit && j.commit.requireTicket === false); // ON by default
  } catch { return true; }
}
function sessionFile(sid) {
  const os = require('os'), path = require('path');
  return path.join(os.homedir(), '.health-harness', 'sessions', String(sid || 'unknown').replace(/[^\w.-]/g, '_') + '.json');
}

/** Impure: run the nudge for an Edit/Write turn. Reuses the switch-nudge session file (anchor = tickets
 * referenced in prompts this session) and stamps `ticketlessWarned` so it fires once. Returns msg or null. */
function maybeNudge(opts) {
  try {
    const fs = require('fs'), path = require('path');
    const file = sessionFile(opts && opts.sessionId);
    let state = {};
    try { state = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* new session */ }
    const sessionKeys = [state.anchor, ...(state.switched || [])].filter(Boolean);
    const msg = evaluate({
      branchKey: branchKey(),
      sessionKeys,
      edited: true,                                  // called from the Edit/Write hook → work has started
      requireTicket: requireTicketOn(opts && opts.cwd),
      alreadyWarned: !!state.ticketlessWarned,
    });
    if (msg) {
      try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ ...state, ticketlessWarned: true })); } catch { /* ignore */ }
    }
    return msg;
  } catch { return null; }
}

module.exports = { evaluate, nudgeMessage, maybeNudge, branchKey, requireTicketOn };

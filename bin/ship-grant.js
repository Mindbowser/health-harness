#!/usr/bin/env node
/**
 * ship-grant.js — a short-lived "the user already approved this publish batch" marker, so the wall doesn't
 * re-ASK on every outward step (push, PR, Jira transition/comment/worklog) AFTER the user signed off once on
 * /ship's verbatim outbound preview. Without it the user approves the batch, then the wall asks again per
 * call — exactly the redundant prompting we want gone.
 *
 * Safety: the grant ONLY suppresses the wall's outward-ASK layer. It NEVER affects DENY — catastrophic
 * commands and the redaction (PHI/secret) gate still fire. It's also tightly bounded: ~3 min TTL, scoped to
 * this repo (path-hashed temp file), set ONLY right after an explicit human approval, cleared when /ship ends.
 *
 * `grantActive` is pure (tested); the rest is I/O. CLI: `set` (write) / `clear` (delete).
 */
'use strict';

const DEFAULT_TTL_MS = 180000; // 3 min — one publish batch

function grantPath(cwd) {
  const os = require('os'), path = require('path'), crypto = require('crypto');
  const key = crypto.createHash('sha1').update(String(cwd || process.cwd())).digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `mb-harness-ship-grant-${key}.json`);
}

/** Pure: is this grant still valid now? (time-bounded; repo scoping comes from the path-hashed file). */
function grantActive(grant, nowMs, ttlMs) {
  return !!(grant && grant.ts && (nowMs - grant.ts) <= (ttlMs || DEFAULT_TTL_MS));
}

/** Impure: read + evaluate the on-disk grant for cwd. Best-effort; absent/expired/garbage → false. */
function isShipGrantActive(cwd) {
  try {
    const g = JSON.parse(require('fs').readFileSync(grantPath(cwd), 'utf8'));
    return grantActive(g, Date.now(), g.ttlMs);
  } catch { return false; }
}

module.exports = { grantPath, grantActive, isShipGrantActive, DEFAULT_TTL_MS };

if (require.main === module) {
  const sub = process.argv[2];
  const fs = require('fs');
  if (sub === 'set') {
    let branch = '';
    try { branch = require('child_process').execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim(); } catch { /* detached/none */ }
    try { fs.writeFileSync(grantPath(process.cwd()), JSON.stringify({ ts: Date.now(), branch, ttlMs: DEFAULT_TTL_MS })); } catch { /* ignore */ }
    process.stdout.write(JSON.stringify({ ok: true, branch, ttlMs: DEFAULT_TTL_MS }));
  } else if (sub === 'clear') {
    try { fs.unlinkSync(grantPath(process.cwd())); } catch { /* already gone */ }
    process.stdout.write(JSON.stringify({ ok: true }));
  } else {
    process.stdout.write('usage: ship-grant.js set|clear  (set right after the user approves /ship\'s preview; clear when done)\n');
  }
  process.exit(0);
}

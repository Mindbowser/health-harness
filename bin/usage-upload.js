#!/usr/bin/env node
/**
 * usage-upload.js — ship the local metadata-only usage log to the MBI Atlas ingest endpoint, so the org
 * can later analyse harness adoption. **Default OFF**: with no `HARNESS_TELEMETRY_ENDPOINT` configured,
 * this is a complete no-op — nothing leaves the machine until telemetry is explicitly enabled (per the
 * PRD's disclosure/DPIA gate). Config is read from env (set via Claude Code settings `env`, and later
 * deployed org-wide via FleetDM managed settings).
 *
 * What it does when enabled: on each run (SessionStart, throttled) it backfills every un-sent day-file and
 * ships only the *new bytes* of the current day, tracking a per-day byte offset in `.upload-state.json`.
 * This gives "at least once a day" delivery (whenever the dev opens a session) plus catch-up for any days
 * the machine was offline. The payload is the same metadata-only JSONL the logger wrote — no code, prompts,
 * file contents, or PHI (the write-time allowlist already guarantees this).
 *
 * Pure helpers (telemetryConfig / dueForRun / newBytesPlan) are exported for tests; main() is impure.
 */
'use strict';

const DEFAULT_INTERVAL_MS = 6 * 3600 * 1000; // at most ~4×/day; backfill covers offline gaps
const DEFAULT_POST_TIMEOUT_MS = 2500; // per-slice network deadline — short, so an inline (hook) run stays snappy

// Baked-in defaults so devs need zero config (private repo; metadata-only, write-only ingest token).
// Env vars override these — FleetDM/managed settings can rotate the token without a code change, and
// HARNESS_TELEMETRY_ENABLED=false is the opt-out. Rotating the token here = a release that propagates
// to installs on next plugin update.
const DEFAULT_ENDPOINT = 'https://mbi.mindbowser.com/atlas/api/harness/usage';
const DEFAULT_TOKEN = '35ce0efd84e8e715514523d1a268925013f38206acc1be6f';

/** Pure: parse telemetry config from env, falling back to the baked-in defaults (so it's ON by default).
 * Opt out with HARNESS_TELEMETRY_ENABLED=false. */
function telemetryConfig(env) {
  const e = env || {};
  const endpoint = String(e.HARNESS_TELEMETRY_ENDPOINT || DEFAULT_ENDPOINT).trim();
  const token = String(e.HARNESS_TELEMETRY_TOKEN || DEFAULT_TOKEN).trim();
  const enabled = endpoint !== '' && String(e.HARNESS_TELEMETRY_ENABLED || '').toLowerCase() !== 'false';
  const intervalMs = parseInt(e.HARNESS_TELEMETRY_INTERVAL_MS, 10) || DEFAULT_INTERVAL_MS;
  return { enabled, endpoint, token, intervalMs };
}

/** Pure: throttle — run if we've never run, or the interval has elapsed. */
function dueForRun(state, nowMs, intervalMs) {
  const last = state && state.lastRun;
  if (!last) return true; // never run before → always go
  return nowMs - last >= intervalMs;
}

/** Pure: given day-files [{day,path,size}] and saved offsets, return the slices still to send. */
function newBytesPlan(files, state) {
  const offsets = (state && state.offsets) || {};
  const plan = [];
  for (const f of (files || []).slice().sort((a, b) => a.day.localeCompare(b.day))) {
    const from = offsets[f.day] || 0;
    if (f.size > from) plan.push({ day: f.day, path: f.path, from, to: f.size });
  }
  return plan;
}

/** Pure: when to persist the throttle clock. Advance `lastRun` ONLY when we fully drained the plan; if we
 * stopped early (deadline hit or a POST failed) keep the previous value so the next session is still "due"
 * and retries the remainder immediately instead of waiting out the interval. Never loses progress — offsets
 * are persisted independently of this. */
function planLastRun(prevLastRun, completedAll, nowMs) {
  return completedAll ? nowMs : (prevLastRun || 0);
}

// runUpload is hoisted (function declaration below) so it's safe to export here alongside the pure helpers.
module.exports = { telemetryConfig, dueForRun, newBytesPlan, planLastRun, runUpload, DEFAULT_INTERVAL_MS, DEFAULT_POST_TIMEOUT_MS };

// ── orchestration (impure) ────────────────────────────────────────────────────────
const DAY_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

function statePath(dir, path) { return path.join(dir, '.upload-state.json'); }

async function postSlice(cfg, body, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs || DEFAULT_POST_TIMEOUT_MS);
  try {
    const res = await fetch(cfg.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(cfg.token ? { authorization: `Bearer ${cfg.token}` } : {}) },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return res.ok;
  } catch { return false; } finally { clearTimeout(timer); }
}

/** Ship un-sent usage bytes to Atlas. Safe to call inline from a hook: it self-throttles, never throws, and
 * is strictly time-boxed by opts.deadlineMs so it can't delay session start. Returns {sent, completedAll}.
 *   opts.deadlineMs   — overall wall-clock budget; stop sending past it (remainder ships next session).
 *   opts.postTimeoutMs — per-slice network timeout.
 * NO DATA LOSS: a day's offset advances ONLY after the server 200s that slice; on any failure/deadline we
 * stop and leave the offset so the exact same bytes re-send next run (at-least-once). */
async function runUpload(opts = {}) {
  const fs = require('fs'), path = require('path');
  const { usageDir, gitEmail, harnessVersion } = require('./usage-log.js');
  const cfg = telemetryConfig(process.env);
  if (!cfg.enabled) return { sent: 0, completedAll: true }; // opted out — nothing leaves the machine

  const deadline = opts.deadlineMs ? Date.now() + opts.deadlineMs : Infinity;
  const dir = usageDir();
  let state = {};
  try { state = JSON.parse(fs.readFileSync(statePath(dir, path), 'utf8')); } catch { /* none */ }
  if (!dueForRun(state, Date.now(), cfg.intervalMs)) return { sent: 0, completedAll: true };

  let files = [];
  try {
    files = fs.readdirSync(dir).map((n) => {
      const m = n.match(DAY_RE);
      if (!m) return null;
      return { day: m[1], path: path.join(dir, n), size: fs.statSync(path.join(dir, n)).size };
    }).filter(Boolean);
  } catch { return { sent: 0, completedAll: false }; }

  const offsets = { ...(state.offsets || {}) };
  const userId = gitEmail(), hv = harnessVersion();
  const plan = newBytesPlan(files, state);
  let sent = 0, completedAll = true;
  for (const slice of plan) {
    if (Date.now() >= deadline) { completedAll = false; break; } // out of budget — remainder ships next session
    let chunk = '';
    try {
      const fd = fs.openSync(slice.path, 'r');
      const buf = Buffer.alloc(slice.to - slice.from);
      fs.readSync(fd, buf, 0, buf.length, slice.from);
      fs.closeSync(fd);
      chunk = buf.toString('utf8');
    } catch { completedAll = false; break; }
    const records = chunk.split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (!records.length) { offsets[slice.day] = slice.to; continue; }
    const ok = await postSlice(cfg, { userId, harnessVersion: hv, day: slice.day, records }, opts.postTimeoutMs);
    if (!ok) { completedAll = false; break; } // stop on first failure; retry next run from the same offset
    offsets[slice.day] = slice.to;
    sent += records.length;
  }

  const lastRun = planLastRun(state.lastRun, completedAll, Date.now());
  try { fs.writeFileSync(statePath(dir, path), JSON.stringify({ ...state, offsets, lastRun })); } catch { /* ignore */ }
  return { sent, completedAll };
}

if (require.main === module) {
  runUpload().catch(() => {}).finally(() => process.exit(0)); // CLI/manual run: unbounded, drains everything
}

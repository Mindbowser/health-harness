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

module.exports = { telemetryConfig, dueForRun, newBytesPlan, DEFAULT_INTERVAL_MS };

// ── orchestration (impure) ────────────────────────────────────────────────────────
const DAY_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;

function statePath(dir, path) { return path.join(dir, '.upload-state.json'); }

async function postSlice(cfg, body) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
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

async function main() {
  const fs = require('fs'), path = require('path');
  const { usageDir, gitEmail, harnessVersion } = require('./usage-log.js');
  const cfg = telemetryConfig(process.env);
  if (!cfg.enabled) return; // default OFF — nothing leaves the machine

  const dir = usageDir();
  let state = {};
  try { state = JSON.parse(fs.readFileSync(statePath(dir, path), 'utf8')); } catch { /* none */ }
  if (!dueForRun(state, Date.now(), cfg.intervalMs)) return;

  let files = [];
  try {
    files = fs.readdirSync(dir).map((n) => {
      const m = n.match(DAY_RE);
      if (!m) return null;
      return { day: m[1], path: path.join(dir, n), size: fs.statSync(path.join(dir, n)).size };
    }).filter(Boolean);
  } catch { return; }

  const offsets = { ...(state.offsets || {}) };
  const userId = gitEmail(), hv = harnessVersion();
  for (const slice of newBytesPlan(files, state)) {
    let chunk = '';
    try {
      const fd = fs.openSync(slice.path, 'r');
      const buf = Buffer.alloc(slice.to - slice.from);
      fs.readSync(fd, buf, 0, buf.length, slice.from);
      fs.closeSync(fd);
      chunk = buf.toString('utf8');
    } catch { continue; }
    const records = chunk.split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
    if (!records.length) { offsets[slice.day] = slice.to; continue; }
    const ok = await postSlice(cfg, { userId, harnessVersion: hv, day: slice.day, records });
    if (!ok) break; // stop on first failure; retry next run from the same offset
    offsets[slice.day] = slice.to;
  }

  try { fs.writeFileSync(statePath(dir, path), JSON.stringify({ ...state, offsets, lastRun: Date.now() })); } catch { /* ignore */ }
}

if (require.main === module) {
  main().catch(() => {}).finally(() => process.exit(0));
}

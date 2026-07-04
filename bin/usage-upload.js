#!/usr/bin/env node
/**
 * usage-upload.js — ship the local metadata-only usage log to the MBI Atlas ingest endpoint, so the org
 * can later analyse harness adoption. **Default OFF**: with no `HARNESS_TELEMETRY_ENDPOINT` configured,
 * this is a complete no-op — nothing leaves the machine until telemetry is explicitly enabled (per the
 * PRD's disclosure/DPIA gate). Config is read from env (set via Claude Code settings `env`, and later
 * deployed org-wide via FleetDM managed settings).
 *
 * What it does when enabled: on each run (SessionStart + Stop, throttled to ~2h) it backfills every un-sent day-file and
 * ships only the *new bytes* of the current day, tracking a per-day byte offset in `.upload-state.json`.
 * This gives "at least once a day" delivery (whenever the dev opens a session) plus catch-up for any days
 * the machine was offline. The payload is the same metadata-only JSONL the logger wrote — no code, prompts,
 * file contents, or PHI (the write-time allowlist already guarantees this).
 *
 * Pure helpers (telemetryConfig / dueForRun / newBytesPlan) are exported for tests; main() is impure.
 */
'use strict';

const DEFAULT_INTERVAL_MS = 2 * 3600 * 1000; // at most ~12×/day; keeps the dashboard ≤2h stale; backfill covers offline gaps
const DEFAULT_POST_TIMEOUT_MS = 2500; // per-slice network deadline — short, so an inline (hook) run stays snappy
const DEFAULT_CHUNK_BYTES = 32 * 1024; // ship a big day in <=32KB pieces so no single POST can outlast the timeout

// Baked-in defaults so devs need zero config (private repo; metadata-only, write-only ingest token).
// Env vars rotate the endpoint/token (FleetDM/managed settings) without a code change. Collection itself
// is MANDATORY (company policy, MBI-60): there is NO env opt-out — a user/MDM HARNESS_TELEMETRY_ENABLED
// is ignored. The only way to turn it off is a plugin RELEASE that ships an empty endpoint — never config.
const DEFAULT_ENDPOINT = 'https://mbi.mindbowser.com/atlas/api/harness/usage';
const DEFAULT_TOKEN = '35ce0efd84e8e715514523d1a268925013f38206acc1be6f';

/** Pure: parse telemetry config from env, falling back to the baked-in defaults. Always enabled as long as
 * an endpoint is configured (always, given the baked-in default) — the legacy HARNESS_TELEMETRY_ENABLED
 * opt-out is deliberately NOT honored (mandatory org-wide collection; see MBI-60). */
function telemetryConfig(env) {
  const e = env || {};
  const endpoint = String(e.HARNESS_TELEMETRY_ENDPOINT || DEFAULT_ENDPOINT).trim();
  const token = String(e.HARNESS_TELEMETRY_TOKEN || DEFAULT_TOKEN).trim();
  const enabled = endpoint !== ''; // mandatory: no env opt-out — only an empty baked-in endpoint (a release) disables
  const intervalMs = parseInt(e.HARNESS_TELEMETRY_INTERVAL_MS, 10) || DEFAULT_INTERVAL_MS;
  return { enabled, endpoint, token, intervalMs };
}

/** Pure: throttle — run if we've never run, the interval has elapsed, OR the running harness version
 * changed since the last upload (flush-on-update, so a dev's update reflects on the dashboard within a
 * rollup cycle instead of lagging up to the throttle interval). currentHv is optional (back-compat). */
function dueForRun(state, nowMs, intervalMs, currentHv) {
  const last = state && state.lastRun;
  if (!last) return true; // never run before → always go
  // Flush-on-update: ship now when the running version differs from the last upload — INCLUDING when lastHv
  // is unknown (the bootstrap case: a dev's first run after updating to a fix-bearing version, where the old
  // uploader never recorded lastHv). Without forcing on undefined, the very update that matters would still
  // lag the throttle. One bootstrap force, then runUpload records lastHv and same-version runs throttle again.
  if (currentHv && state.lastHv !== currentHv) return true;
  return nowMs - last >= intervalMs;
}

/** Pure: should this run ship now? `force === true` bypasses the throttle entirely — the immediate feedback
 * flush (MBI-115 / S4): consented feedback ships at once via the SAME transport, not the ~2h sweep. Without
 * force it is exactly dueForRun, so every non-feedback caller keeps the normal throttle. */
function shouldUpload(state, nowMs, intervalMs, currentHv, force) {
  return force === true || dueForRun(state, nowMs, intervalMs, currentHv);
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

/** Pure: split a Buffer of newline-terminated JSONL into ascending cut offsets so each chunk is <= maxBytes
 * and never splits a record (cuts only land on '\n'). A single line longer than maxBytes becomes its own
 * chunk (records are atomic). The last cut equals buf.length. This bounds every POST so a large day-file
 * ships in pieces — the offset advances per chunk — instead of one oversized request that outlives the
 * per-POST timeout and can never make progress. */
function chunkCuts(buf, maxBytes) {
  const cuts = [];
  const n = buf.length;
  let start = 0;
  while (start < n) {
    let end = Math.min(start + maxBytes, n);
    if (end < n) {
      const nl = buf.lastIndexOf(0x0a, end - 1); // last '\n' at/under the cap within this chunk
      if (nl >= start) end = nl + 1;
      else { const next = buf.indexOf(0x0a, end); end = next === -1 ? n : next + 1; } // line > maxBytes: keep whole
    }
    cuts.push(end);
    start = end;
  }
  return cuts;
}

/** Pure: when to persist the throttle clock. Advance `lastRun` ONLY when we fully drained the plan; if we
 * stopped early (deadline hit or a POST failed) keep the previous value so the next session is still "due"
 * and retries the remainder immediately instead of waiting out the interval. Never loses progress — offsets
 * are persisted independently of this. */
function planLastRun(prevLastRun, completedAll, nowMs) {
  return completedAll ? nowMs : (prevLastRun || 0);
}

// runUpload is hoisted (function declaration below) so it's safe to export here alongside the pure helpers.
module.exports = { telemetryConfig, dueForRun, shouldUpload, newBytesPlan, planLastRun, chunkCuts, runUpload, DEFAULT_INTERVAL_MS, DEFAULT_POST_TIMEOUT_MS, DEFAULT_CHUNK_BYTES };

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
  const hv = harnessVersion(); // current installed version — drives flush-on-version-change + stamped on the upload
  // opts.force bypasses the throttle → the immediate feedback flush (S4). Everything else still self-throttles.
  if (!shouldUpload(state, Date.now(), cfg.intervalMs, hv, opts.force)) return { sent: 0, completedAll: true };

  let files = [];
  try {
    files = fs.readdirSync(dir).map((n) => {
      const m = n.match(DAY_RE);
      if (!m) return null;
      return { day: m[1], path: path.join(dir, n), size: fs.statSync(path.join(dir, n)).size };
    }).filter(Boolean);
  } catch { return { sent: 0, completedAll: false }; }

  const offsets = { ...(state.offsets || {}) };
  const userId = gitEmail();
  const chunkBytes = parseInt(process.env.HARNESS_TELEMETRY_CHUNK_BYTES, 10) || DEFAULT_CHUNK_BYTES;
  let sent = 0, completedAll = true;
  outer:
  for (const slice of newBytesPlan(files, state)) {
    let dayBuf;
    try {
      const fd = fs.openSync(slice.path, 'r');
      dayBuf = Buffer.alloc(slice.to - slice.from);
      fs.readSync(fd, dayBuf, 0, dayBuf.length, slice.from);
      fs.closeSync(fd);
    } catch { completedAll = false; break; }
    let pos = 0; // bytes of THIS day's slice confirmed-sent so far
    for (const cut of chunkCuts(dayBuf, chunkBytes)) {
      if (Date.now() >= deadline) { completedAll = false; break outer; } // out of budget — resume mid-day next run
      const records = dayBuf.slice(pos, cut).toString('utf8').split('\n')
        .filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      if (records.length) {
        const ok = await postSlice(cfg, { userId, harnessVersion: hv, day: slice.day, records }, opts.postTimeoutMs);
        if (!ok) { completedAll = false; break outer; } // stop on first failure; resume from this offset next run
        sent += records.length;
      }
      pos = cut;
      offsets[slice.day] = slice.from + pos; // advance the durable cursor PER CHUNK, not per day
    }
  }

  const lastRun = planLastRun(state.lastRun, completedAll, Date.now());
  try { fs.writeFileSync(statePath(dir, path), JSON.stringify({ ...state, offsets, lastRun, lastHv: hv })); } catch { /* ignore */ }
  return { sent, completedAll };
}

if (require.main === module) {
  // `flush` = a hook-driven run (Stop): inline but strictly time-boxed so it can never delay the turn end.
  // Bare run = CLI/manual: unbounded, drains everything. Both still self-throttle via dueForRun (2h) UNLESS
  // `--force` is passed (MBI-115 / S4): the /harness-feedback skill forces an immediate flush after consent
  // so consented feedback reaches Atlas at once instead of waiting out the throttle.
  const flush = process.argv[2] === 'flush';
  const force = process.argv.includes('--force');
  const opts = flush ? { deadlineMs: 2500, postTimeoutMs: 2000, force } : { force };
  const guard = flush ? setTimeout(() => process.exit(0), 2800) : null;
  if (guard && guard.unref) guard.unref();
  runUpload(opts).catch(() => {}).finally(() => process.exit(0));
}

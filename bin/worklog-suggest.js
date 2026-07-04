#!/usr/bin/env node
/**
 * worklog-suggest.js — suggest a Jira worklog time from git activity on the branch.
 *
 * Manual time logging gets skipped; this proposes a defensible number so the human only
 * confirms or tweaks it. It estimates *active* effort (not raw wall-clock, which overcounts
 * overnight gaps): a small lead-in before the first commit, plus the gap before each commit
 * capped at an idle threshold (a long gap = you stepped away, so it's capped, not summed).
 *
 * The suggestion is ALWAYS a proposal — the caller shows it and logs only the value the user
 * confirms/overrides (and the worklog write itself is an outward MCP call the wall ASKs on).
 *
 * Usage:
 *   node bin/worklog-suggest.js                 # commits on the current branch since its base
 *   node bin/worklog-suggest.js --base dev      # override the base branch
 *   node bin/worklog-suggest.js --json          # machine output only
 *
 * Config (optional) — .health-harness/project.json "timeTracking":
 *   { "logWork": true, "roundTo": "5m", "idleGapMins": 90, "leadInMins": 30, "maxPerDay": "8h" }
 * roundTo is rounded to nearest and CAPPED at 5m — a coarser value is clamped down, so logged time never
 * inflates to 15/30/60-min buckets (MBI-104).
 */
'use strict';

const DAY_MS = 24 * 60 * 60 * 1000;

// Worklog time is rounded to 5-minute granularity — fine enough to reflect actual effort, never the coarse
// 15/30/60-min buckets that inflate logged time (MBI-104). MAX_ROUND caps any per-project override.
const MAX_ROUND_MINS = 5;
const DEFAULTS = { idleGapMins: 90, leadInMins: 30, roundToMins: 5, maxPerDayMins: 8 * 60 };

/** Pure: round minutes to the nearest `granularity` (round, not floor/ceil). */
function roundMinutes(mins, granularity) {
  const g = granularity > 0 ? granularity : MAX_ROUND_MINS;
  return Math.round(mins / g) * g;
}

/** Parse a Jira-style duration ("2h 30m", "90m", "1d 4h", "0.5h") to minutes. Returns null if unparseable. */
function parseDuration(s) {
  if (s == null) return null;
  if (typeof s === 'number') return Math.round(s);
  const str = String(s).trim().toLowerCase();
  if (!str) return null;
  if (/^\d+(\.\d+)?$/.test(str)) return Math.round(parseFloat(str) * 60); // bare number = hours
  let mins = 0, matched = false;
  const re = /(\d+(?:\.\d+)?)\s*([dhm])/g;
  let m;
  while ((m = re.exec(str)) !== null) {
    matched = true;
    const n = parseFloat(m[1]);
    mins += m[2] === 'd' ? n * 8 * 60 : m[2] === 'h' ? n * 60 : n; // a Jira "day" = 8h
  }
  return matched ? Math.round(mins) : null;
}

/** Format minutes to a Jira duration ("2h 15m", "30m", "2h"). */
function formatDuration(mins) {
  const total = Math.max(0, Math.round(mins));
  const h = Math.floor(total / 60), m = total % 60;
  return [h ? `${h}h` : null, m ? `${m}m` : null].filter(Boolean).join(' ') || '0m';
}

/** Merge a raw config object (string durations) with defaults → numeric opts. */
function resolveOpts(cfg) {
  const c = cfg || {};
  return {
    idleGapMins: parseDuration(c.idleGap || c.idleGapMins) ?? DEFAULTS.idleGapMins,
    leadInMins: parseDuration(c.leadIn || c.leadInMins) ?? DEFAULTS.leadInMins,
    roundToMins: (() => { const r = parseDuration(c.roundTo || c.roundToMins); return r && r > 0 ? Math.min(r, MAX_ROUND_MINS) : DEFAULTS.roundToMins; })(), // capped at 5m — never coarser (MBI-104)
    maxPerDayMins: parseDuration(c.maxPerDay || c.maxPerDayMins) ?? DEFAULTS.maxPerDayMins,
  };
}

/**
 * Core (pure): estimate effort from ascending commit timestamps (ms).
 *
 * Returns a *default* `minutes` = ACTIVE effort (lead-in + sub-threshold gaps) — a lower bound, since
 * testing/QA/review/debugging produce no commits. Also returns `elapsedMinutes` = the raw first→last
 * span (an upper bound) so the caller can nudge the human to bump toward it for untracked work.
 * { minutes, timeSpent, elapsedMinutes, elapsed, started, commits, basis }.
 */
function suggestFromTimestamps(commitTimesMs, opts) {
  const o = { ...DEFAULTS, ...(opts || {}) };
  const times = (commitTimesMs || []).filter((t) => Number.isFinite(t)).slice().sort((a, b) => a - b);
  if (times.length === 0) {
    return { minutes: 0, timeSpent: '0m', elapsedMinutes: 0, elapsed: '0m', started: null, commits: 0, basis: 'no-commits' };
  }
  let active = o.leadInMins; // pre-first-commit reading/setup
  for (let i = 1; i < times.length; i++) {
    const gapMins = (times[i] - times[i - 1]) / 60000;
    active += Math.min(gapMins, o.idleGapMins); // long gap = stepped away → capped, not summed
  }
  // cap to a sane ceiling: maxPerDay × calendar days the work spans
  const spanDays = Math.max(1, Math.ceil((times[times.length - 1] - times[0]) / DAY_MS) || 1);
  active = Math.min(active, o.maxPerDayMins * spanDays);
  // round to 5-min granularity, floor at one unit
  let mins = roundMinutes(active, o.roundToMins);
  if (mins < o.roundToMins) mins = o.roundToMins;
  // elapsed = raw first→last span + lead-in (the upper-bound context; commits-only, so it omits any
  // post-last-commit testing — the human still tops it up on override).
  const elapsedRaw = o.leadInMins + (times[times.length - 1] - times[0]) / 60000;
  const elapsedMinutes = roundMinutes(elapsedRaw, o.roundToMins);
  return {
    minutes: mins,
    timeSpent: formatDuration(mins),
    elapsedMinutes,
    elapsed: formatDuration(elapsedMinutes),
    started: new Date(times[0]).toISOString(),
    commits: times.length,
    basis: times.length === 1 ? 'single-commit-leadin' : 'active-gaps',
  };
}

module.exports = { suggestFromTimestamps, parseDuration, formatDuration, resolveOpts, roundMinutes, DEFAULTS, MAX_ROUND_MINS };

// ── CLI ───────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const { execSync } = require('child_process');
  const fs = require('fs');
  const path = require('path');
  const args = process.argv.slice(2);
  const jsonOnly = args.includes('--json');
  const baseArg = (() => { const i = args.indexOf('--base'); return i >= 0 ? args[i + 1] : null; })();
  const cwd = process.cwd();

  const run = (c) => execSync(c, { cwd, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();

  // config + base branch
  let cfg = {};
  try { cfg = (JSON.parse(fs.readFileSync(path.join(cwd, '.health-harness', 'project.json'), 'utf8')).timeTracking) || {}; } catch { /* defaults */ }
  if (cfg.logWork === false) {
    const out = { logWork: false, message: 'timeTracking.logWork is false — worklog suggestion skipped.' };
    process.stdout.write(jsonOnly ? JSON.stringify(out) : out.message + '\n');
    process.exit(0);
  }
  let base = baseArg;
  if (!base) {
    try { const j = JSON.parse(fs.readFileSync(path.join(cwd, '.health-harness', 'project.json'), 'utf8')); base = (j.git && j.git.baseBranch) || j.defaultBranch; } catch { /* fall through */ }
  }
  if (!base) { for (const b of ['main', 'master']) { try { run(`git rev-parse --verify ${b}`); base = b; break; } catch { /* next */ } } }

  let times = [];
  try {
    const range = base ? `${base}..HEAD` : 'HEAD';
    const raw = run(`git log --format=%ct ${range}`);
    times = raw ? raw.split('\n').map((s) => parseInt(s, 10) * 1000).filter(Number.isFinite) : [];
  } catch {
    const out = { error: 'not-a-git-repo-or-no-commits', message: 'Could not read git history; suggest a time manually.' };
    process.stdout.write(jsonOnly ? JSON.stringify(out) : out.message + '\n');
    process.exit(0);
  }

  const s = suggestFromTimestamps(times, resolveOpts(cfg));
  const out = { ...s, base: base || null };
  if (jsonOnly) { process.stdout.write(JSON.stringify(out)); process.exit(0); }
  if (s.commits === 0) {
    process.stdout.write(`No commits on this branch vs ${base || 'base'} yet — suggest a time manually.\n`);
  } else {
    process.stdout.write(
      `Suggested worklog: ${s.timeSpent} active  (${s.commits} commit${s.commits === 1 ? '' : 's'} since ${base || 'base'}, ` +
      `started ${out.started}, idle gaps excluded).\n` +
      `Elapsed span: ${s.elapsed} (for reference).  Override if needed (e.g. "1h 30m"); the worklog write asks for your approval.\n`
    );
  }
  process.exit(0);
}

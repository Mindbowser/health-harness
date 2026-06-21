#!/usr/bin/env node
/**
 * usage-coach.js — turn yesterday's (and Monday's: last-week's) usage log into a short, principle-based
 * coaching note. Pure functions (cadence / summarize / buildCoaching) so they're testable; the SessionStart
 * hook (session-context.js) calls runCoach() to decide-and-emit at most ONCE A DAY (+ a weekly note Monday).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { usageDir } = require('./usage-log.js');

function isoDate(d) { return d.toISOString().slice(0, 10); }
function isoWeek(d) {
  // ISO-8601 week: Thursday-anchored
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const wk = Math.ceil(((t - yearStart) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(wk).padStart(2, '0')}`;
}

/**
 * Pure: should we coach now, and which kind? Daily fires once per calendar day; weekly fires the first
 * session on a Monday (and supersedes the daily that day). state = { lastDaily, lastWeekly }.
 * Returns { kind: 'weekly'|'daily'|null, day, week }.
 */
function coachCadence(now, state) {
  const s = state || {};
  const day = isoDate(now), week = isoWeek(now);
  const isMonday = now.getDay() === 1;
  if (isMonday && s.lastWeekly !== week) return { kind: 'weekly', day, week };
  if (s.lastDaily !== day) return { kind: 'daily', day, week };
  return { kind: null, day, week };
}

/** Pure: aggregate JSONL records into the coaching metrics. */
function summarize(records) {
  const m = { sessions: 0, edits: 0, gateRuns: 0, gatePass: 0, commands: {}, wallDeny: 0, wallAsk: 0,
    objections: 0, commits: 0, prompts: 0, promptsCtx: 0, compactions: 0 };
  for (const r of records || []) {
    switch (r.event) {
      case 'session_start': m.sessions++; break;
      case 'edit': m.edits++; break;
      case 'gate_run': m.gateRuns++; if (r.result === 'pass') m.gatePass++; break;
      case 'command': m.commands[r.name] = (m.commands[r.name] || 0) + 1; break;
      case 'wall': if (r.action === 'deny') m.wallDeny++; else if (r.action === 'ask') m.wallAsk++; break;
      case 'user_reject': case 'interrupt': case 'revert': case 'correction': m.objections++; break;
      case 'commit': m.commits++; break;
      case 'prompt': m.prompts++; if (r.hasContext) m.promptsCtx++; break;
      case 'compaction': m.compactions++; break;
      default: break;
    }
  }
  return m;
}

function rate(n, d) { return d > 0 ? n / d : null; }

/**
 * Pure: a private, MOTIVATING daily/weekly coach — celebrate what's working, show progress vs the prior
 * period, then give ONE pointed next lever (with the *how* + why it's a 10x habit). Never a wall of
 * criticism. Returns '' on a true no-activity day (never nag). `prev` (optional) = the prior window's
 * metrics, used to surface improvement deltas.
 */
function buildCoaching(m, kind, prev) {
  if (!m || (!m.edits && !m.gateRuns && !(Object.keys(m.commands || {}).length) && !m.wallDeny && !m.objections
    && !m.commits && !m.prompts && !m.compactions)) return ''; // nothing happened — stay silent

  const cmd = m.commands || {};
  const align = cmd.align || 0, tdd = cmd.tdd || 0;
  const passRate = rate(m.gatePass, m.gateRuns);
  const ctxRate = rate(m.promptsCtx, m.prompts);

  // ── 🔥 Wins (always lead with these) ───────────────────────────────────
  const wins = [];
  if (m.gateRuns > 0) wins.push(`gate ran ${m.gateRuns}×`);
  if (align > 0) wins.push(`/align ×${align}`);
  if (m.commits > 0) wins.push(`${m.commits} commit${m.commits > 1 ? 's' : ''}`);
  if (m.objections > 0) wins.push(`${m.objections} push-back${m.objections > 1 ? 's' : ''} on AI output`);
  if (ctxRate !== null && ctxRate >= 0.6) wins.push('context-rich prompts');

  // ── 📈 Improvements vs the prior period (positive reinforcement) ────────
  const ups = [];
  if (prev) {
    const pPass = rate(prev.gatePass, prev.gateRuns), pCtx = rate(prev.promptsCtx, prev.prompts);
    const pct = (x) => `${Math.round(x * 100)}%`;
    if (passRate !== null && pPass !== null && passRate - pPass >= 0.1) ups.push(`gate pass-rate ${pct(pPass)}→${pct(passRate)}`);
    if (ctxRate !== null && pCtx !== null && ctxRate - pCtx >= 0.1) ups.push(`prompt context ${pct(pCtx)}→${pct(ctxRate)}`);
    if ((align) > (prev.commands && prev.commands.align || 0)) ups.push(`/align up`);
    if (m.commits > (prev.commits || 0)) ups.push(`more commits (${prev.commits || 0}→${m.commits})`);
    if ((prev.objections || 0) === 0 && m.objections > 0) ups.push(`started hard-harnessing the model`);
  }

  // ── 🎯 ONE next lever (highest-impact, framed as growth toward 10x) ──────
  let lever = '';
  if (passRate !== null && m.gateRuns >= 2 && passRate < 0.5)
    lever = 'take smaller steps — fix red before moving on. Tiny green-to-green loops are how the fastest AI devs avoid debugging marathons.';
  else if (m.edits >= 8 && m.gateRuns <= 1)
    lever = 'run the gate after each change, not in batches — fast feedback is the #1 habit separating 10x AI devs from the rest.';
  else if (tdd > 0 && align === 0)
    lever = 'try /align before building — sharpening intent into criteria up front pays back many times over in review.';
  else if (m.edits >= 6 && m.objections === 0)
    lever = 'treat AI output as a draft, not an answer — reject/redo a few. Hard-harnessing the model (not rubber-stamping it) is the real 10x skill.';
  else if (m.prompts >= 5 && ctxRate !== null && ctxRate < 0.3)
    lever = 'load your prompts with context — name the file, ticket, and the spec. Precise asks get first-try-right output and cut rework.';
  else if (m.compactions >= 3)
    lever = `you compacted ${m.compactions}× — clear and reload a focused context instead. Staying in the smart zone keeps the model sharp.`;

  // ── build the note ──────────────────────────────────────────────────────
  const head = kind === 'weekly' ? '📊 Harness — last week' : '📊 Harness — yesterday';
  const lines = [head];
  if (wins.length) lines.push(`🔥 Wins: ${wins.slice(0, 3).join(', ')}.`);
  if (ups.length) lines.push(`📈 Improving: ${ups.slice(0, 2).join(', ')} — keep it going.`);
  if (lever) lines.push(`🎯 Next lever: ${lever}`);
  // governance always surfaces (it's a guardrail, framed as a habit not a scolding)
  if (m.wallDeny > 0) lines.push(`🛡️ ${m.wallDeny} action(s) the wall blocked (e.g. force-push) — branch + PR keeps history safe.`);
  // motivational closer — vary by whether they got a lever or are cruising
  if (lever) lines.push('💪 Pick that one thing today — small habit, compounding returns.');
  else if (wins.length || ups.length) lines.push('💪 Strong day — this is what becoming a 10x AI dev looks like.');
  return lines.join('\n');
}

module.exports = { coachCadence, summarize, buildCoaching, isoDate, isoWeek, runCoach };

// ── orchestration (called by SessionStart) ───────────────────────────────────────
function readRecords(dateStrs) {
  const recs = [];
  for (const ds of dateStrs) {
    try {
      const lines = fs.readFileSync(path.join(usageDir(), `${ds}.jsonl`), 'utf8').split('\n');
      for (const ln of lines) { if (ln.trim()) { try { recs.push(JSON.parse(ln)); } catch { /* skip */ } } }
    } catch { /* no file that day */ }
  }
  return recs;
}
function statePath() { return path.join(usageDir(), '.coach-state.json'); }

/** Decide cadence, read the right window, return a coaching string (or '') and persist state. now = Date. */
function runCoach(now) {
  try {
    let state = {};
    try { state = JSON.parse(fs.readFileSync(statePath(), 'utf8')); } catch { /* none */ }
    const { kind, day, week } = coachCadence(now, state);
    if (!kind) return '';
    // window: daily = yesterday; weekly = previous 7 days. Also read the window BEFORE that, so we can
    // show progress (improvement deltas) vs the prior period.
    const span = kind === 'weekly' ? 7 : 1;
    const days = [], prevDays = [];
    for (let i = 1; i <= span; i++) { const d = new Date(now); d.setDate(d.getDate() - i); days.push(isoDate(d)); }
    for (let i = span + 1; i <= span * 2; i++) { const d = new Date(now); d.setDate(d.getDate() - i); prevDays.push(isoDate(d)); }
    const prev = summarize(readRecords(prevDays));
    const msg = buildCoaching(summarize(readRecords(days)), kind, prev);
    // persist (mark done so it won't repeat today)
    const next = { ...state, lastDaily: day };
    if (kind === 'weekly') next.lastWeekly = week;
    try { fs.mkdirSync(usageDir(), { recursive: true }); fs.writeFileSync(statePath(), JSON.stringify(next)); } catch { /* ignore */ }
    return msg;
  } catch { return ''; }
}

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
    objections: 0, commits: 0 };
  for (const r of records || []) {
    switch (r.event) {
      case 'session_start': m.sessions++; break;
      case 'edit': m.edits++; break;
      case 'gate_run': m.gateRuns++; if (r.result === 'pass') m.gatePass++; break;
      case 'command': m.commands[r.name] = (m.commands[r.name] || 0) + 1; break;
      case 'wall': if (r.action === 'deny') m.wallDeny++; else if (r.action === 'ask') m.wallAsk++; break;
      case 'user_reject': case 'interrupt': case 'revert': case 'correction': m.objections++; break;
      case 'commit': m.commits++; break;
      default: break;
    }
  }
  return m;
}

/** Pure: principle-based coaching lines from metrics. Returns a short string (or '' if nothing notable). */
function buildCoaching(m, kind) {
  const tips = [], wins = [];
  const cmd = m.commands || {};
  const align = cmd.align || 0, tdd = cmd.tdd || 0;

  // feedback loop: edits per gate-run
  if (m.edits >= 8 && m.gateRuns <= 1) tips.push('Tighten the loop — many edits, the gate barely ran. Run it after each change.');
  else if (m.gateRuns > 0) wins.push(`gate ran ${m.gateRuns}×`);
  if (m.gateRuns >= 2 && m.gatePass / m.gateRuns < 0.5) tips.push('Gate failed more than it passed — smaller steps, fix red before moving on.');

  // align before build
  if (tdd > 0 && align === 0) tips.push('You built without /align — sharpen intent into criteria first; it pays back in review.');
  else if (align > 0) wins.push(`/align ×${align}`);

  // objecting / hard-harnessing
  if (m.edits >= 6 && m.objections === 0) tips.push('Lots of AI output, zero pushback — treat it as a draft: reject/correct/redo, don’t rubber-stamp.');
  else if (m.objections > 0) wins.push(`${m.objections} corrections (good — you’re harnessing the model)`);

  // governance
  if (m.wallDeny > 0) tips.push(`${m.wallDeny} blocked action(s) (e.g. force-push) — branch + PR instead.`);

  const head = kind === 'weekly' ? '📊 Harness — last week' : '📊 Harness — yesterday';
  const top = tips.slice(0, 3);
  const parts = [];
  if (top.length) parts.push('Try: ' + top.join(' '));
  if (wins.length) parts.push('Strong: ' + wins.slice(0, 2).join(', ') + '.');
  if (!parts.length) return '';
  return `${head}: ${parts.join(' ')}`;
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
    // window: daily = yesterday; weekly = previous 7 days
    const days = [];
    const span = kind === 'weekly' ? 7 : 1;
    for (let i = 1; i <= span; i++) { const d = new Date(now); d.setDate(d.getDate() - i); days.push(isoDate(d)); }
    const msg = buildCoaching(summarize(readRecords(days)), kind);
    // persist (mark done so it won't repeat today)
    const next = { ...state, lastDaily: day };
    if (kind === 'weekly') next.lastWeekly = week;
    try { fs.mkdirSync(usageDir(), { recursive: true }); fs.writeFileSync(statePath(), JSON.stringify(next)); } catch { /* ignore */ }
    return msg;
  } catch { return ''; }
}

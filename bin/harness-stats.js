#!/usr/bin/env node
/**
 * harness-stats.js — your OWN harness usage, rendered as a compact `/usage`-style dashboard. Reads the
 * local metadata-only log (~/.health-harness/usage/) and shows activity, the coaching dimensions, trend
 * sparklines, and the same motivational summary the daily coach gives. Read-only, private, on-demand
 * (the `/harness-stats` skill calls it). Default window: 7 days; pass a number of days as argv[2].
 *
 * Pure render helpers (sparkline/bar/pct/renderDashboard) are exported for tests; main() is impure.
 */
'use strict';

const SPARK = '▁▂▃▄▅▆▇█';

/** Pure: render a numeric series as block-glyph sparkline. */
function sparkline(nums) {
  const a = nums || [];
  if (!a.length) return '';
  const max = Math.max(...a, 0);
  if (max <= 0) return SPARK[0].repeat(a.length);
  return a.map((n) => SPARK[Math.min(SPARK.length - 1, Math.round((n / max) * (SPARK.length - 1)))]).join('');
}
/** Pure: proportional bar. */
function bar(n, max, width) {
  const w = width || 12;
  const filled = max > 0 ? Math.round((Math.min(n, max) / max) * w) : 0;
  return '█'.repeat(filled) + '░'.repeat(w - filled);
}
/** Pure: percent or em-dash for n/a. */
function pct(r) { return r === null || r === undefined ? '—' : `${Math.round(r * 100)}%`; }

function sumDays(byDay) {
  const t = { sessions: 0, edits: 0, gateRuns: 0, gatePass: 0, commands: {}, commits: 0, prompts: 0, promptsCtx: 0, compactions: 0, objections: 0, wallDeny: 0, migrationGaps: 0, coverageDrops: 0, depFlags: 0, breakingChanges: 0 };
  for (const { m } of byDay || []) {
    for (const k of ['sessions', 'edits', 'gateRuns', 'gatePass', 'commits', 'prompts', 'promptsCtx', 'compactions', 'objections', 'wallDeny', 'migrationGaps', 'coverageDrops', 'depFlags', 'breakingChanges']) t[k] += m[k] || 0;
    for (const [c, n] of Object.entries(m.commands || {})) t.commands[c] = (t.commands[c] || 0) + n;
  }
  return t;
}

/** Pure: render the dashboard string from per-day summaries. */
function renderDashboard({ rangeLabel, byDay, prev, coach }) {
  const t = sumDays(byDay);
  const days = byDay || [];
  const pad = (s, n) => String(s).padEnd(n);
  const passRate = t.gateRuns > 0 ? t.gatePass / t.gateRuns : null;
  const ctxRate = t.prompts > 0 ? t.promptsCtx / t.prompts : null;
  const align = t.commands.align || 0, tdd = t.commands.tdd || 0;
  const L = [];
  L.push(`╭─ 📊 Your MB Harness usage — ${rangeLabel} ${'─'.repeat(Math.max(2, 31 - rangeLabel.length))}╮`);
  L.push(`│ Activity   ${pad(sparkline(days.map((d) => d.m.edits || 0)), 14)} ${t.edits} edits · ${t.sessions} sessions`);
  L.push(`│`);
  L.push(`│ Feedback loop`);
  L.push(`│   gate runs        ${bar(t.gateRuns, Math.max(t.gateRuns, t.edits, 1), 12)} ${t.gateRuns}  (pass ${pct(passRate)})`);
  L.push(`│ Align before code`);
  L.push(`│   /align · /tdd    ${align} · ${tdd}`);
  L.push(`│ Small steps`);
  L.push(`│   commits          ${t.commits}`);
  L.push(`│ Prompt quality`);
  L.push(`│   context-rich     ${bar(t.promptsCtx, Math.max(t.prompts, 1), 12)} ${pct(ctxRate)} of ${t.prompts}`);
  L.push(`│ Critical engagement`);
  L.push(`│   push-backs       ${t.objections}`);
  L.push(`│ Smart zone`);
  L.push(`│   compactions      ${t.compactions}`);
  if (t.wallDeny > 0) L.push(`│ 🛡️  wall blocks     ${t.wallDeny}`);
  // hygiene — only show the row if anything fired (keeps a clean day clean)
  if (t.migrationGaps || t.coverageDrops || t.depFlags) {
    L.push(`│ Hygiene`);
    if (t.migrationGaps) L.push(`│   migration gaps   ${t.migrationGaps}`);
    if (t.coverageDrops) L.push(`│   coverage drops   ${t.coverageDrops}`);
    if (t.depFlags)      L.push(`│   dep flags        ${t.depFlags}`);
  }
  L.push(`╰${'─'.repeat(52)}╯`);
  if (coach) L.push('', coach);
  return L.join('\n');
}

module.exports = { sparkline, bar, pct, renderDashboard, sumDays };

// ── orchestration (impure) ──────────────────────────────────────────────────────
function main() {
  const fs = require('fs'), path = require('path');
  const { usageDir } = require('./usage-log.js');
  const { summarize, buildCoaching } = require('./usage-coach.js');
  const span = Math.max(1, Math.min(90, parseInt(process.argv[2], 10) || 7));

  const isoDate = (d) => d.toISOString().slice(0, 10);
  const now = new Date();
  const readDay = (ds) => {
    try {
      const recs = [];
      for (const ln of fs.readFileSync(path.join(usageDir(), `${ds}.jsonl`), 'utf8').split('\n')) {
        if (ln.trim()) { try { recs.push(JSON.parse(ln)); } catch { /* skip */ } }
      }
      return recs;
    } catch { return []; }
  };

  // window = the last `span` days INCLUDING today (i=0); prev = the `span` days before that, for deltas.
  const byDay = [], windowRecs = [], prevRecs = [];
  for (let i = span - 1; i >= 0; i--) { const d = new Date(now); d.setDate(d.getDate() - i); const ds = isoDate(d); const recs = readDay(ds); byDay.push({ day: ds, m: summarize(recs) }); windowRecs.push(...recs); }
  for (let i = 2 * span - 1; i >= span; i--) { const d = new Date(now); d.setDate(d.getDate() - i); prevRecs.push(...readDay(isoDate(d))); }

  const coach = buildCoaching(summarize(windowRecs), span >= 7 ? 'weekly' : 'daily', summarize(prevRecs));
  process.stdout.write(renderDashboard({ rangeLabel: `last ${span} days`, byDay, coach }) + '\n');
}

if (require.main === module) main();

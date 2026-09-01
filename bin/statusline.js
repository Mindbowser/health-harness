#!/usr/bin/env node
/**
 * statusline.js — a composed Claude Code statusline for the harness (MBI-138, usage cells MBI-146).
 *
 * Two halves, joined by ` ║ `:
 *   • TICKET HEALTH (left) — the harness context Claude Code's default line omits: an at-a-glance
 *     **on-track/off-track** verdict (are we following harness discipline for the current task?), the
 *     current **ticket** (from the branch), a **criteria-unmet** badge (`⚠ N criteria unmet`, the same gap
 *     the wall blocks a push on — surfaced while you code, not at `git push`), a **no-ticket** badge
 *     (`⛔ no ticket`) on a feature branch with no key, and the live **open-questions** badge (`❓N open`).
 *     Each drops when clean.
 *   • USAGE (right) — model · cost · context% · 5-hour limit · weekly limit · session, with heat-coloured
 *     mini-bars. Read from the SAME stdin session JSON (no extra data source). The weekly bar is the one
 *     that matters — the allowance that runs out days before it resets.
 *
 * Disable options (env): HARNESS_STATUSLINE=off (whole line) · HARNESS_STATUSLINE_TICKET=off (ticket half) ·
 * HARNESS_STATUSLINE_USAGE=off (usage half). Default: all on.
 *
 * Enable it via settings.json `statusLine` → a stable wrapper (plugins can't declare a statusline, and
 * statusLine doesn't expand ${CLAUDE_PLUGIN_ROOT}); the wrapper resolves the current installed version so it
 * survives plugin updates. See README → "See the open questions (statusline)".
 *
 * Pure (unit-tested): heat, bar, usageCell, renderUsage, criteriaBadge, renderStatusline.
 * Impure: stdin parse + git/ledger/coverage resolution + reset-time formatting in main.
 */
'use strict';
const oq = require('./open-questions.js');

// ── ANSI + heat helpers (pure) ────────────────────────────────────────────────
const DIM = 90, CYAN = 36, GREEN = 32, YELL = 33, RED = 31;
const C = (c, s) => `\x1b[${c}m${s}\x1b[0m`;
/** Colour by how much is GONE, so the eye is drawn to the bar that's nearly spent. */
function heat(p) { return p >= 85 ? RED : p >= 60 ? YELL : GREEN; }
/** A fixed-width filled/empty bar for a 0–100 pct. */
function bar(p, w = 5) {
  const n = Math.min(w, Math.max(0, Math.round(((Number(p) || 0) / 100) * w)));
  return C(heat(p), '█'.repeat(n)) + C(DIM, '░'.repeat(w - n));
}
/** One usage cell: `label ▮▮░░ NN%` + optional `↻reset`. `reset` is a pre-formatted string (kept pure). */
function usageCell(label, pct, reset) {
  const p = Math.round(Number(pct) || 0);
  return `${C(DIM, label)} ${bar(p)} ${C(heat(p), p + '%')}` + (reset ? C(DIM, ' ↻' + reset) : '');
}

// ── badges (pure) ─────────────────────────────────────────────────────────────
/** Amber `⚠ N criteria unmet` when >0 (the push-blocking gap), '' otherwise. */
function criteriaBadge(count) {
  const n = Number(count) || 0;
  return n > 0 ? C(YELL, `⚠ ${n} criteria unmet`) : '';
}

/**
 * At-a-glance harness-discipline verdict: green `✓ on-track` when the current work follows the rules
 * (a ticket is linked, no acceptance criteria are unmet, no open questions), amber `⚠ off-track` when
 * any slip is present (the specific badges say which). Silent off a work branch (no ticket + not
 * ticketless, e.g. on main) — there's no task to judge. NOT "compliant": that word means PHI/HIPAA
 * compliance in this repo; this is process-discipline, a different axis.
 */
function rulesBadge(s) {
  const p = s || {};
  const onWorkBranch = !!p.ticket || !!p.ticketless;
  if (!onWorkBranch) return '';
  const clean = !!p.ticket && !p.ticketless && (Number(p.unmet) || 0) === 0 && (Number(p.open) || 0) === 0;
  return clean ? C(GREEN, '✓ on-track') : C(YELL, '⚠ off-track');
}

/** Pure: which parts of the line to render, from env. Master `HARNESS_STATUSLINE=off` kills it; per-half
 * `HARNESS_STATUSLINE_USAGE=off` / `HARNESS_STATUSLINE_TICKET=off` drop a half. Default: all on. */
function segmentToggles(env) {
  const e = env || {};
  const off = (v) => String(v || '').toLowerCase() === 'off';
  if (off(e.HARNESS_STATUSLINE)) return { line: false, ticket: false, usage: false };
  return { line: true, ticket: !off(e.HARNESS_STATUSLINE_TICKET), usage: !off(e.HARNESS_STATUSLINE_USAGE) };
}

// ── usage half (pure) ─────────────────────────────────────────────────────────
/**
 * Compose the usage half from an already-resolved shape (reset times pre-formatted in main):
 *   { model, fast, cost, ctx, fiveH:{pct,reset}, week:{pct,reset}, session }
 * Every cell drops when its field is absent. Returns '' for empty/omitted usage.
 */
function renderUsage(u) {
  if (!u) return '';
  const cells = [];
  if (u.model) cells.push(C(CYAN, u.model) + (u.fast ? C(DIM, '⚡') : ''));
  if (u.cost != null) cells.push(C(DIM, '$' + (u.cost >= 100 ? Math.round(u.cost) : Number(u.cost).toFixed(2))));
  if (u.ctx != null) cells.push(usageCell('ctx', u.ctx));
  if (u.fiveH && u.fiveH.pct != null) cells.push(usageCell('5h', u.fiveH.pct, u.fiveH.reset));
  if (u.week && u.week.pct != null) cells.push(usageCell('week', u.week.pct, u.week.reset));
  if (u.session) cells.push(C(DIM, u.session));
  return cells.join(C(DIM, ' │ '));
}

// ── the whole line (pure) ─────────────────────────────────────────────────────
/** Compose the line. Left half: `dir · ticket|⛔no ticket · ⚠unmet · ❓open`. Right half: usage cells. */
function renderStatusline(parts) {
  const p = parts || {};
  const left = [];
  if (p.dir) left.push(p.dir);
  if (p.rules) { const rb = rulesBadge(p); if (rb) left.push(rb); }
  if (p.ticket) left.push(p.ticket);
  else if (p.ticketless) left.push(C(YELL, '⛔ no ticket'));
  const cb = criteriaBadge(p.unmet); if (cb) left.push(cb);
  const badge = oq.statusBadge(p.open); if (badge) left.push(badge);

  const ticketHalf = left.join('  ·  ');
  const usageHalf = renderUsage(p.usage);
  if (ticketHalf && usageHalf) return ticketHalf + C(DIM, '  ║  ') + usageHalf;
  return ticketHalf || usageHalf || '';
}

module.exports = { renderStatusline, heat, bar, usageCell, renderUsage, criteriaBadge, rulesBadge, segmentToggles };

// ── impure: gather state + stdin usage, then render ───────────────────────────
if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    const toggles = segmentToggles(process.env);
    if (!toggles.line) { process.stdout.write(''); return; } // master off → nothing
    let j = {};
    try { j = JSON.parse(raw || '{}'); } catch { /* no/blank stdin */ }
    let cwd = process.cwd();
    try { cwd = (j.workspace && j.workspace.current_dir) || j.cwd || (j.workspace && j.workspace.project_dir) || cwd; } catch { /* keep */ }
    let dir = null; try { dir = require('path').basename(cwd); } catch { /* keep null */ }

    // ticket-health half (opt-out with HARNESS_STATUSLINE_TICKET=off): ticket, open questions,
    // ticketless, criteria-unmet, and the on-track/off-track verdict.
    let ticket = null, open = 0, ticketless = false, unmet = 0, rules = false;
    if (toggles.ticket) {
      rules = true;
      try { const cur = oq.currentLedger(cwd); ticket = cur.key; open = oq.openCount(cur.ledger); } catch { /* dormant */ }
      if (!ticket) {
        try {
          const br = require('child_process').execSync('git rev-parse --abbrev-ref HEAD', { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
          ticketless = !!br && !/^(main|master|develop|HEAD)$/.test(br);
        } catch { /* not a repo → no badge */ }
      }
      // criteria-unmet (the push-blocking gap), if a manifest exists for this ticket
      try { const cc = require('./criteria-coverage.js').currentCoverage(cwd); if (cc.hasManifest && cc.cov) unmet = cc.cov.uncovered.length; } catch { /* dormant */ }
    }

    // usage half from the stdin session JSON (opt-out with HARNESS_STATUSLINE_USAGE=off)
    let usage;
    if (toggles.usage) {
      const when = (ts) => {
        if (!ts) return '';
        const d = new Date(ts * 1000), now = new Date();
        const hh = String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
        return d.toDateString() === now.toDateString() ? hh
          : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] + ' ' + hh;
      };
      const rl = j.rate_limits || {};
      usage = {
        model: j.model && j.model.display_name,
        fast: !!j.fast_mode,
        cost: j.cost && j.cost.total_cost_usd,
        ctx: j.context_window && j.context_window.used_percentage,
        fiveH: rl.five_hour && { pct: rl.five_hour.used_percentage, reset: when(rl.five_hour.resets_at) },
        week: rl.seven_day && { pct: rl.seven_day.used_percentage, reset: when(rl.seven_day.resets_at) },
        session: j.session_name,
      };
    }

    process.stdout.write(renderStatusline({ dir, rules, ticket, ticketless, unmet, open, usage }));
  });
}

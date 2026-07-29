#!/usr/bin/env node
/**
 * statusline.js — a composed Claude Code statusline for the harness (MBI-138).
 *
 * Shows the harness-relevant context Claude Code's default line doesn't: the current **ticket** (from the
 * branch) and a live **open-questions badge** (`❓N open`, amber when >0, hidden at 0) — so unresolved
 * "I don't know yet" guesses are always in view, like a PR count. Reads Claude Code's session JSON on stdin.
 *
 * Enable it via settings.json `statusLine` → a stable wrapper (plugins can't declare a statusline, and
 * statusLine doesn't expand ${CLAUDE_PLUGIN_ROOT}); the wrapper resolves the current installed version so it
 * survives plugin updates. See README → "See the open questions (statusline)".
 *
 * Pure (unit-tested): renderStatusline. Impure: stdin parse + git/ledger resolution in main.
 */
'use strict';
const oq = require('./open-questions.js');

/** Pure: compose the line from resolved bits. `dir` · `ticket` · `❓N open` — segments join only when present. */
function renderStatusline(parts) {
  const p = parts || {};
  const segs = [];
  if (p.dir) segs.push(p.dir);
  if (p.ticket) segs.push(p.ticket);
  const badge = oq.statusBadge(p.open); // '' at 0 → dropped; amber ❓N when >0
  if (badge) segs.push(badge);
  return segs.join('  ·  ');
}

module.exports = { renderStatusline };

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    let cwd = process.cwd();
    try { const j = JSON.parse(raw || '{}'); cwd = (j.workspace && j.workspace.current_dir) || j.cwd || (j.workspace && j.workspace.project_dir) || cwd; } catch { /* no/blank stdin → cwd */ }
    let dir = null; try { dir = require('path').basename(cwd); } catch { /* keep null */ }
    let ticket = null, open = 0;
    try { const cur = oq.currentLedger(cwd); ticket = cur.key; open = oq.openCount(cur.ledger); } catch { /* dormant */ }
    process.stdout.write(renderStatusline({ dir, ticket, open }));
  });
}

#!/usr/bin/env node
/**
 * jira-transitions.js — map a Jira project's actual workflow transitions to the harness's semantic events,
 * so /ship transitions the ticket by a stored id instead of GUESSING a status name per ship.
 *
 * The reuse loop: /start fetches the real transitions (Atlassian MCP `getTransitionsForJiraIssue`), this
 * INFERS the mapping deterministically (name/target-status heuristics), the human confirms ONCE, and it's
 * persisted to `.health-harness/project.json` → every later /ship (and teammate, since project.json is
 * committed) reuses it with zero input. /ship self-heals: if a stored id is stale, re-fetch + re-confirm.
 *
 * inferTransitions() is pure (exported for tests). The CLI does I/O:
 *   getTransitionsForJiraIssue(...) | node jira-transitions.js infer     # → { transitions, needsConfirm }
 *   echo '<confirmed-map>'          | node jira-transitions.js write      # → merge into project.json
 */
'use strict';

// Match a transition by its name AND its target status name (Jira often names transitions after either).
// onMerge is OPTIONAL — it's usually not reachable from an early state, so its absence doesn't force a confirm.
const SLOTS = {
  onStart: /\b(in progress|start progress|start work|in development|in dev|wip)\b/i,
  onShip:  /\b(ready for qa|in review|code review|peer review|in qa|review|testing|qa)\b/i,
  onMerge: /\b(done|closed|resolved|complete(d)?|merged|shipped)\b/i,
};
const OPTIONAL = new Set(['onMerge']);

/** Pure: Jira transitions list → { transitions: {onStart,onShip,onMerge|null}, needsConfirm }.
 * Accepts either an array or the `{ transitions: [...] }` shape the API returns. A slot resolves only on a
 * UNIQUE match; zero or multiple matches on a non-optional slot sets needsConfirm so the skill asks. */
function inferTransitions(input) {
  const list = Array.isArray(input) ? input : (input && input.transitions) || [];
  const norm = list.map((t) => ({ id: String(t.id), name: String(t.name || ''), toName: String((t.to && t.to.name) || '') }));
  const text = (t) => `${t.name} ${t.toName}`;
  const out = {};
  let needsConfirm = false;
  for (const [slot, re] of Object.entries(SLOTS)) {
    const hits = norm.filter((t) => re.test(text(t)));
    out[slot] = hits.length ? { id: hits[0].id, name: hits[0].toName || hits[0].name } : null;
    if (!OPTIONAL.has(slot) && hits.length !== 1) needsConfirm = true; // none or ambiguous → confirm
  }
  return { transitions: out, needsConfirm };
}

module.exports = { inferTransitions, SLOTS };

// ── CLI ───────────────────────────────────────────────────────────────────────
if (require.main === module) {
  const sub = process.argv[2];
  const readStdin = (cb) => {
    const arg = process.argv[3];
    if (arg) return cb(arg);
    let raw = '';
    process.stdin.on('data', (c) => { raw += c; });
    process.stdin.on('end', () => cb(raw));
    setTimeout(() => cb(raw), 300); // don't hang if no stdin
  };
  const done = (o) => { process.stdout.write(JSON.stringify(o)); process.exit(0); };

  if (sub === 'infer') {
    readStdin((raw) => { let input; try { input = JSON.parse(raw || '{}'); } catch { return done({ error: 'bad-json' }); } done(inferTransitions(input)); });
  } else if (sub === 'write') {
    readStdin((raw) => {
      let map; try { map = JSON.parse(raw || '{}'); } catch { return done({ error: 'bad-json' }); }
      const fs = require('fs'), path = require('path');
      const p = path.join(process.cwd(), '.health-harness', 'project.json');
      let j = {}; try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { /* new */ }
      j.jira = j.jira || {};
      j.jira.transitions = map.transitions || map; // accept {transitions:{…}} or the bare map
      try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(j, null, 2) + '\n'); } catch (e) { return done({ error: e.message }); }
      done({ ok: true, transitions: j.jira.transitions });
    });
  } else {
    process.stdout.write('usage: jira-transitions.js infer <transitions-json> | write <confirmed-map-json>\n');
    process.exit(0);
  }
}

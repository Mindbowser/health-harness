#!/usr/bin/env node
/**
 * issue-graph.js — DETERMINISTIC issue relatedness from Jira's structured hierarchy (parent / epic / links),
 * so the switch-nudge only suggests a fresh session for genuinely UNRELATED work — never for a sibling
 * subtask, a same-epic story, or a linked bug, where the carried context is exactly the memory that helps.
 *
 * No LLM judgment: `relate()` is a pure function over the Jira graph. The graph is populated cheaply by the
 * skills that already read the ticket (/align, /tdd, /ship) via the `set` CLI → cached in
 * ~/.health-harness/issue-graph.json (hierarchy is stable, so it's reused, not re-fetched).
 *
 * Pure (projectOf / relate / isRelated) are exported for tests; loadGraph + CLI are I/O.
 */
'use strict';

/** Pure: project prefix from an issue key (ABC-123 → ABC). '' if not a key. */
function projectOf(key) { const m = /^([A-Z][A-Z0-9]+)-\d+/.exec(String(key || '')); return m ? m[1] : ''; }

// Related tiers → context helps → DON'T nudge. (same-project / unrelated fall through to the size gate.)
const KEEP_TIERS = new Set(['sibling', 'parent-child', 'epic', 'linked']);

/** Pure: relatedness tier of `newKey` vs the issues worked this session, given a graph
 * (key → { parent, epic, links:[keys] }). Strongest relation wins. → { tier, relatedTo }. */
function relate(newKey, sessionKeys, graph) {
  const g = graph || {};
  const nm = g[newKey] || {};
  const keys = (sessionKeys || []).filter((k) => k && k !== newKey);
  for (const k of keys) if (nm.parent && g[k] && nm.parent === g[k].parent) return { tier: 'sibling', relatedTo: k };        // same parent story
  for (const k of keys) if (nm.parent === k || (g[k] && g[k].parent === newKey)) return { tier: 'parent-child', relatedTo: k }; // story ↔ its subtask
  for (const k of keys) if (nm.epic && g[k] && nm.epic === g[k].epic) return { tier: 'epic', relatedTo: k };                  // same epic
  for (const k of keys) if ((nm.links || []).includes(k) || (g[k] && (g[k].links || []).includes(newKey))) return { tier: 'linked', relatedTo: k }; // explicit issue link
  const np = projectOf(newKey);
  for (const k of keys) if (np && projectOf(k) === np) return { tier: 'same-project', relatedTo: k };                          // weak — same project only
  return { tier: 'unrelated', relatedTo: null };
}

/** Pure: does this tier mean "keep the context" (related work)? */
function isRelated(tier) { return KEEP_TIERS.has(tier); }

function graphPath() { const os = require('os'), path = require('path'); return path.join(os.homedir(), '.health-harness', 'issue-graph.json'); }
function loadGraph() { try { return JSON.parse(require('fs').readFileSync(graphPath(), 'utf8')); } catch { return {}; } }

module.exports = { projectOf, relate, isRelated, KEEP_TIERS, graphPath, loadGraph };

// ── CLI ───────────────────────────────────────────────────────────────────────
// /align, /tdd, /ship call this after they read the ticket — records its hierarchy (no extra fetch).
//   node issue-graph.js set key=ABC-259 parent=ABC-258 epic=ABC-200 links=ABC-300,ABC-301
if (require.main === module) {
  if (process.argv[2] === 'set') {
    const kv = require('./usage-log.js').parseKv(process.argv.slice(3));
    const key = kv.key;
    if (!key) { process.stdout.write('need key=ABC-123\n'); process.exit(0); }
    const fs = require('fs'), path = require('path');
    const g = loadGraph();
    g[String(key)] = {
      parent: kv.parent ? String(kv.parent) : null,
      epic: kv.epic ? String(kv.epic) : null,
      links: kv.links ? String(kv.links).split(',').map((s) => s.trim()).filter(Boolean) : [],
    };
    try { fs.mkdirSync(path.dirname(graphPath()), { recursive: true }); fs.writeFileSync(graphPath(), JSON.stringify(g)); } catch { /* ignore */ }
    process.stdout.write(JSON.stringify({ ok: true, key: String(key), entry: g[String(key)] }));
  } else {
    process.stdout.write('usage: issue-graph.js set key=ABC-259 parent=ABC-258 epic=ABC-200 links=ABC-300,ABC-301\n');
  }
  process.exit(0);
}

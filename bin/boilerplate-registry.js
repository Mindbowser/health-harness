#!/usr/bin/env node
/**
 * boilerplate-registry.js — resolve a tech-stack name to its MB boilerplate repo, from a CENTRAL registry
 * (single source of truth) so new projects scaffold with zero per-dev config. `/scaffold-from-boilerplate`
 * calls this.
 *
 * The registry is a `registry.json` in a central repo (default `Mindbowser/boilerplates`, override with
 * `MB_BOILERPLATE_REGISTRY` = `owner/repo`, `owner/repo:path`, or a raw https URL):
 *
 *   { "react-node": { "repo": "https://github.com/Mindbowser/bp-react-node", "kind": "monorepo",
 *                     "aliases": ["react+node","mern"], "description": "..." }, ... }
 *
 * Adding a stack = a one-line PR to that repo — instantly available to everyone, no plugin release.
 *
 * Pure (parseRegistry / listStacks / matchStack / registrySource) is exported for tests; fetch/CLI are impure.
 *
 * Usage:  node boilerplate-registry.js list
 *         node boilerplate-registry.js resolve "<stack>"   # prints {key,repo,kind} JSON, exit 1 if no match
 */
'use strict';

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');

/** Pure: parse + validate the registry JSON. Drops entries without a `repo`. Returns {} on any error. */
function parseRegistry(text) {
  try {
    const o = JSON.parse(text);
    if (!o || typeof o !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(o)) if (v && typeof v === 'object' && typeof v.repo === 'string') out[k] = v;
    return out;
  } catch { return {}; }
}

/** Pure: the available stack keys. */
function listStacks(reg) { return Object.keys(reg || {}); }

/** Pure: resolve a query (stack name, alias, or fuzzy) to { key, ...entry } or null. */
function matchStack(reg, query) {
  reg = reg || {};
  const q = norm(query);
  if (!q) return null;
  const keys = Object.keys(reg);
  const hit = (k) => ({ key: k, ...reg[k] });
  for (const k of keys) if (norm(k) === q) return hit(k);                                   // exact key
  for (const k of keys) if ((reg[k].aliases || []).some((a) => norm(a) === q)) return hit(k); // exact alias
  for (const k of keys) { const nk = norm(k); if (nk.includes(q) || q.includes(nk)) return hit(k); } // fuzzy key
  for (const k of keys) if ((reg[k].aliases || []).some((a) => { const na = norm(a); return na.includes(q) || q.includes(na); })) return hit(k); // fuzzy alias
  return null;
}

/** Pure: where the registry lives (default central repo; env override). */
function registrySource(env) { return String((env || {}).MB_BOILERPLATE_REGISTRY || '').trim() || 'Mindbowser/boilerplates'; }

module.exports = { parseRegistry, listStacks, matchStack, registrySource, norm };

// ── orchestration (impure) ──────────────────────────────────────────────────────
/** Impure: fetch the registry.json text from the configured source (private-repo aware via gh / token). */
function fetchRegistryText() {
  const { execSync } = require('child_process');
  const src = registrySource(process.env);
  const run = (c) => execSync(c, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
  if (/^https?:\/\//i.test(src)) {
    const tok = process.env.MB_BOILERPLATE_TOKEN || process.env.MB_GITHUB_TOKEN || '';
    const auth = tok ? `-H "Authorization: Bearer ${tok}" ` : '';
    return run(`curl -fsSL ${auth}"${src}"`);
  }
  // owner/repo[:path] → GitHub contents API (raw). Works for PRIVATE repos via the user's gh auth.
  const [repo, path = 'registry.json'] = src.split(':');
  return run(`gh api -H "Accept: application/vnd.github.raw" "repos/${repo}/contents/${path}"`);
}

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  let reg;
  try { reg = parseRegistry(fetchRegistryText()); }
  catch (e) {
    console.error(`✗ could not read the boilerplate registry from "${registrySource(process.env)}".`);
    console.error(`  Create it (see docs/boilerplates.md) or set MB_BOILERPLATE_REGISTRY. Detail: ${e.message}`);
    process.exit(2);
  }
  const stacks = listStacks(reg);
  if (!stacks.length) { console.error('✗ registry is empty — add stacks to registry.json (see docs/boilerplates.md).'); process.exit(2); }

  if (cmd === 'list' || !cmd) {
    console.log('Available boilerplate stacks:');
    for (const k of stacks) console.log(`  ${k}  (${reg[k].kind || 'unknown'})${reg[k].description ? ' — ' + reg[k].description : ''}`);
    process.exit(0);
  }
  if (cmd === 'resolve') {
    const m = matchStack(reg, rest.join(' '));
    if (!m) { console.error(`✗ no boilerplate for "${rest.join(' ')}". Available: ${stacks.join(', ')}`); process.exit(1); }
    console.log(JSON.stringify({ key: m.key, repo: m.repo, kind: m.kind || null }));
    process.exit(0);
  }
  console.error('usage: boilerplate-registry.js list | resolve "<stack>"'); process.exit(2);
}

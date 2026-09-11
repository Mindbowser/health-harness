#!/usr/bin/env node
/**
 * harness-config.js — the ONE layered settings store for the harness (MBI-149, epic MBI-148).
 *
 * Two layers, two tiers:
 *   - repo layer  → `.health-harness/settings.json` (committed, shared by the team)
 *   - user layer  → `~/.health-harness/settings.json` (personal, never committed)
 *   - tier `locked`       → org policy, always resolves to its enforced value; `set` refuses it
 *   - tier `configurable` → default shown; a dev may override it in that setting's layer
 *
 * Design rules (so upgrading the plugin never changes behavior until onboarding runs):
 *   - additive + safe-defaulted: an absent key resolves to its schema default
 *   - merge-not-clobber: `set` preserves every other key already in the layer file
 *   - locked keys ignore file contents entirely (can't be turned off by editing JSON)
 *
 * Later slices ADD keys to SCHEMA and READ resolved values via effective()/get(); they never
 * introduce a parallel config store. resolve()/coerce()/validateSet() are pure (exported for tests).
 */
'use strict';

// key → { tier, layer, default, type }. `type` drives CLI coercion + validation.
const SCHEMA = {
  // ── configurable (defaults shown; dev may change) ──
  branchNaming:            { tier: 'configurable', layer: 'repo', default: 'feature/<KEY>-<slug>', type: 'string' },
  protectedBranches:       { tier: 'configurable', layer: 'repo', default: ['main', 'master', 'prod', 'production', 'release/*'], type: 'list' },
  diffReviewBeforePush:    { tier: 'configurable', layer: 'user', default: true, type: 'boolean' },
  'sound.enabled':         { tier: 'configurable', layer: 'user', default: true, type: 'boolean' },
  // pre-hook practices menu (slice 6 wires the checks; the toggles live here now)
  'hooks.mergeConflictMarkers': { tier: 'configurable', layer: 'repo', default: true, type: 'boolean' },
  'hooks.focusedTestGuard':     { tier: 'configurable', layer: 'repo', default: true, type: 'boolean' },
  'hooks.debugLeftover':        { tier: 'configurable', layer: 'repo', default: false, type: 'boolean' },
  'hooks.largeFile':            { tier: 'configurable', layer: 'repo', default: true, type: 'boolean' },
  'hooks.plainEnglishCommit':   { tier: 'configurable', layer: 'repo', default: false, type: 'boolean' },
  // ── locked (org policy; cannot be disabled) ──
  secretScanning:          { tier: 'locked', layer: 'repo', default: true, type: 'boolean' },
  branchProtection:        { tier: 'locked', layer: 'repo', default: true, type: 'boolean' },
  ticketKeyedCommits:      { tier: 'locked', layer: 'repo', default: true, type: 'boolean' },
  testGate:                { tier: 'locked', layer: 'repo', default: true, type: 'boolean' },
  redactionEgress:         { tier: 'locked', layer: 'repo', default: true, type: 'boolean' },
};

/** Pure: coerce a CLI string (or already-typed value) to the schema type. */
function coerce(type, raw) {
  if (type === 'boolean') return raw === true || String(raw).toLowerCase() === 'true';
  if (type === 'list') return Array.isArray(raw)
    ? raw
    : String(raw).split(',').map((s) => s.trim()).filter(Boolean);
  return String(raw);
}

/** Pure: resolve the effective config from the two layer objects.
 * Returns { key: { value, tier, layer, source } }; source ∈ default|repo|user|locked. */
function resolve(repoObj, userObj) {
  const repo = repoObj || {}, user = userObj || {};
  const out = {};
  for (const [key, spec] of Object.entries(SCHEMA)) {
    if (spec.tier === 'locked') {
      out[key] = { value: spec.default, tier: 'locked', layer: spec.layer, source: 'locked' };
      continue;
    }
    const src = spec.layer === 'user' ? user : repo;
    if (Object.prototype.hasOwnProperty.call(src, key)) {
      out[key] = { value: coerce(spec.type, src[key]), tier: 'configurable', layer: spec.layer, source: spec.layer };
    } else {
      out[key] = { value: spec.default, tier: 'configurable', layer: spec.layer, source: 'default' };
    }
  }
  return out;
}

/** Pure: is this key a known, settable (configurable) key? → { ok, value?, error?, layer? } */
function validateSet(key, rawValue) {
  const spec = SCHEMA[key];
  if (!spec) return { ok: false, error: `unknown setting "${key}"` };
  if (spec.tier === 'locked') return { ok: false, error: `"${key}" is locked (org policy) and cannot be changed` };
  return { ok: true, value: coerce(spec.type, rawValue), layer: spec.layer };
}

// ── impure helpers (disk) — dirs = { repoDir, homeDir } ──
function paths(dirs) {
  const path = require('path'), os = require('os');
  const repoDir = (dirs && dirs.repoDir) || process.cwd();
  const homeDir = (dirs && dirs.homeDir) || os.homedir();
  return {
    repo: path.join(repoDir, '.health-harness', 'settings.json'),
    user: path.join(homeDir, '.health-harness', 'settings.json'),
  };
}
function readFileObj(p) {
  try { return JSON.parse(require('fs').readFileSync(p, 'utf8')) || {}; } catch { return {}; }
}

/** Impure: the resolved effective config from disk. */
function effective(dirs) {
  const p = paths(dirs);
  return resolve(readFileObj(p.repo), readFileObj(p.user));
}

/** Impure: resolved value for one key (or undefined if unknown). */
function get(dirs, key) {
  const e = effective(dirs);
  return e[key] ? e[key].value : undefined;
}

/** Impure: set a configurable key in its layer file (merge, not clobber). */
function set(dirs, key, rawValue) {
  const v = validateSet(key, rawValue);
  if (!v.ok) return v;
  const fs = require('fs'), path = require('path');
  const p = paths(dirs);
  const file = v.layer === 'user' ? p.user : p.repo;
  const cur = readFileObj(file);
  cur[key] = v.value;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(cur, null, 2) + '\n');
  return { ok: true, file, value: v.value, layer: v.layer };
}

module.exports = { SCHEMA, coerce, resolve, validateSet, paths, effective, get, set };

// ── CLI ─────────────────────────────────────────────────────────────────────
//   harness-config.js                 → print the effective config (JSON)
//   harness-config.js get <key>       → print one resolved value
//   harness-config.js set <key> <val> → change a configurable key (refuses locked/unknown)
if (require.main === module) {
  const sub = process.argv[2];
  const done = (o, code = 0) => { process.stdout.write(JSON.stringify(o, null, 2) + '\n'); process.exit(code); };
  if (sub === 'set') {
    const [, , , key, ...rest] = process.argv;
    const r = set({}, key, rest.join(' '));
    done(r, r.ok ? 0 : 2);
  } else if (sub === 'get') {
    done({ key: process.argv[3], value: get({}, process.argv[3]) });
  } else {
    done(effective({}));
  }
}

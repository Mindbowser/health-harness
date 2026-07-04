#!/usr/bin/env node
/**
 * gate-evidence.js — deterministic proof that the gate actually ran GREEN for the commit being shipped, so a
 * hallucinated "tests pass" can't get past /ship. The PostToolUse hook records the REAL result (exit code) of
 * every gate run, keyed to the HEAD sha at that moment. The wall reads it at push/PR time.
 *
 * Three honest states (pure `evidenceState`):
 *   - 'verified'   — a real PASSING gate run exists for the current HEAD sha → ship freely.
 *   - 'unverified' — the repo HAS a gate but there's no passing run for THIS commit (never ran, failed, or
 *                    committed after the last green) → the wall ASKs; you run it green or consciously approve.
 *   - 'no-gate'    — the repo has no real gate at all → shipping is allowed but flagged UNVERIFIED (and you
 *                    should add a gate; onboarding's hard-gate exists for exactly this).
 * Never a silent skip: the no-gate / unverified paths require a conscious human ACK, and are recorded.
 *
 * Evidence is a small per-repo temp file (path-hashed, like ship-grant) — transient, never committed.
 */
'use strict';

const KEEP = 20; // remember the last N commits' gate results

/** Pure: hasGate × hasPassForHead → state. */
function evidenceState(hasGate, passForHead) {
  if (!hasGate) return 'no-gate';
  return passForHead ? 'verified' : 'unverified';
}

function evidencePath(cwd) {
  const os = require('os'), path = require('path'), crypto = require('crypto');
  const key = crypto.createHash('sha1').update(String(cwd || process.cwd())).digest('hex').slice(0, 12);
  return path.join(os.tmpdir(), `mb-harness-gate-evidence-${key}.json`);
}

// The evidence file is `{ runs: { sha → {result,ts} }, green: {sha,ts}|null, editTs: number }`. Older files
// were a flat `{ sha → {result,ts} }` map — load() migrates those transparently (markers just start empty).
function load(cwd) {
  let raw = {};
  try { raw = JSON.parse(require('fs').readFileSync(evidencePath(cwd), 'utf8')) || {}; } catch { /* none */ }
  if (raw && raw.runs && typeof raw.runs === 'object') {
    return { runs: raw.runs, green: raw.green || null, editTs: raw.editTs || 0 };
  }
  return { runs: raw && typeof raw === 'object' ? raw : {}, green: null, editTs: 0 }; // legacy flat schema
}

function save(cwd, model) {
  const keep = Object.keys(model.runs).sort((a, b) => (model.runs[b].ts || 0) - (model.runs[a].ts || 0)).slice(0, KEEP);
  const runs = {}; for (const k of keep) runs[k] = model.runs[k];
  try { require('fs').writeFileSync(evidencePath(cwd), JSON.stringify({ runs, green: model.green || null, editTs: model.editTs || 0 })); } catch { /* ignore */ }
}

/**
 * Pure: should the most-recent green run be inherited by the commit now being made? Only when a green marker
 * exists AND no source edit happened after it — i.e. the tree that went green is the tree being committed.
 * (Conservative by design: any later edit → false → the wall asks for a fresh run. Never a false 'verified'.)
 */
function shouldPropagate(green, editTs) {
  if (!green || !green.ts) return false;
  return (editTs || 0) <= green.ts;
}

/** Impure: record a gate result for a commit sha. A PASS arms the green marker (for commit-time inheritance);
 * a FAIL disarms it. `ts` is injectable for deterministic tests. */
function record(cwd, sha, result, ts) {
  if (!sha) return;
  const when = ts == null ? Date.now() : ts;
  const m = load(cwd);
  const pass = result !== 'fail';
  m.runs[sha] = { result: pass ? 'pass' : 'fail', ts: when };
  m.green = pass ? { sha, ts: when } : null;
  save(cwd, m);
}

/** Impure: note that source code changed at `ts` (invalidates any armed green — the tree moved on). */
function touchEdit(cwd, ts) {
  const m = load(cwd);
  m.editTs = Math.max(m.editTs || 0, ts == null ? Date.now() : ts);
  save(cwd, m);
}

/** Impure: the armed green marker (or null). Exposed for tests/debug. */
function greenMarker(cwd) { return load(cwd).green; }

/**
 * Impure: called right after a `git commit` succeeds (HEAD is now the new commit). If the green run that
 * preceded the commit is still clean (no edits since), record a PASS for the new sha so the freshly-created
 * commit is `verified` without a redundant re-run. The marker is consumed (one commit inherits, not many).
 * Returns whether it propagated. This is the fix for the "green, then commit → unverified" class (AC-2).
 */
function propagateOnCommit(cwd, newSha, ts) {
  if (!newSha) return false;
  const m = load(cwd);
  if (!shouldPropagate(m.green, m.editTs)) return false;
  m.runs[newSha] = { result: 'pass', ts: ts == null ? Date.now() : ts };
  m.green = null; // consumed — a later commit must earn its own green
  save(cwd, m);
  return true;
}

/** Impure: is there a recorded PASSING run for this sha? */
function hasPassFor(cwd, sha) {
  if (!sha) return false;
  const r = load(cwd).runs[sha];
  return !!(r && r.result === 'pass');
}

/** Impure: does this repo have a REAL gate? (onboarded gate command, or a non-stub package.json test). */
function repoHasGate(cwd) {
  const fs = require('fs'), path = require('path'), dir = cwd || process.cwd();
  try { const p = JSON.parse(fs.readFileSync(path.join(dir, '.health-harness', 'project.json'), 'utf8')); if (p.gate) return true; } catch { /* none */ }
  try { const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')); const t = (pkg.scripts && pkg.scripts.test) || ''; if (t && !/no test specified/i.test(t)) return true; } catch { /* none */ }
  return false;
}

function headSha(cwd) {
  try { return require('child_process').execSync('git rev-parse HEAD', { cwd: cwd || process.cwd(), stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim(); } catch { return ''; }
}

/** Impure: the live state for cwd (what the wall + /ship read). */
function currentState(cwd) {
  const dir = cwd || process.cwd();
  const sha = headSha(dir);
  return { state: evidenceState(repoHasGate(dir), hasPassFor(dir, sha)), sha };
}

module.exports = { evidenceState, record, hasPassFor, repoHasGate, headSha, currentState, evidencePath,
  shouldPropagate, touchEdit, greenMarker, propagateOnCommit };

// CLI: `record pass|fail` (gate_run path) · `commit` (propagate a clean green to the new HEAD) · `edit`
// (mark the tree dirty) · `state` (debug).
if (require.main === module) {
  const sub = process.argv[2];
  if (sub === 'record') { record(process.cwd(), headSha(), process.argv[3] === 'fail' ? 'fail' : 'pass'); process.stdout.write(JSON.stringify({ ok: true })); }
  else if (sub === 'commit') { const ok = propagateOnCommit(process.cwd(), headSha()); process.stdout.write(JSON.stringify({ ok: true, propagated: ok })); }
  else if (sub === 'edit') { touchEdit(process.cwd()); process.stdout.write(JSON.stringify({ ok: true })); }
  else if (sub === 'state') { const c = currentState(process.cwd()); process.stdout.write(JSON.stringify({ state: c.state, sha: String(c.sha).slice(0, 12) })); }
  else process.stdout.write('usage: gate-evidence.js record pass|fail | commit | edit | state\n');
  process.exit(0);
}

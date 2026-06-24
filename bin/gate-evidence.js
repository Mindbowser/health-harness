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

/** Impure: record a gate result for a commit sha. */
function record(cwd, sha, result) {
  if (!sha) return;
  const fs = require('fs');
  let e = {}; try { e = JSON.parse(fs.readFileSync(evidencePath(cwd), 'utf8')); } catch { /* none */ }
  e[sha] = { result: result === 'fail' ? 'fail' : 'pass', ts: Date.now() };
  const keep = Object.keys(e).sort((a, b) => (e[b].ts || 0) - (e[a].ts || 0)).slice(0, KEEP);
  const trimmed = {}; for (const k of keep) trimmed[k] = e[k];
  try { fs.writeFileSync(evidencePath(cwd), JSON.stringify(trimmed)); } catch { /* ignore */ }
}

/** Impure: is there a recorded PASSING run for this sha? */
function hasPassFor(cwd, sha) {
  if (!sha) return false;
  try { const e = JSON.parse(require('fs').readFileSync(evidencePath(cwd), 'utf8')); return !!(e[sha] && e[sha].result === 'pass'); } catch { return false; }
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

module.exports = { evidenceState, record, hasPassFor, repoHasGate, headSha, currentState, evidencePath };

// CLI: `record pass|fail` (from the PostToolUse gate_run path) · `state` (debug).
if (require.main === module) {
  const sub = process.argv[2];
  if (sub === 'record') { record(process.cwd(), headSha(), process.argv[3] === 'fail' ? 'fail' : 'pass'); process.stdout.write(JSON.stringify({ ok: true })); }
  else if (sub === 'state') { const c = currentState(process.cwd()); process.stdout.write(JSON.stringify({ state: c.state, sha: String(c.sha).slice(0, 12) })); }
  else process.stdout.write('usage: gate-evidence.js record pass|fail | state\n');
  process.exit(0);
}

#!/usr/bin/env node
/**
 * session-context.js — SessionStart hook. Injects a one-line harness status into the session so the
 * agent always knows the compliance profile, active sprint, and gate — without re-reading — and nudges
 * /start on an un-onboarded repo. Fires on startup/resume/clear/compact (so it survives compaction).
 *
 * Output contract: exit 0 with { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }.
 * Fail-safe: any error → no output → no context injected (harmless). Never throws.
 */
'use strict';

/**
 * Pure: build the one-line context from harness state.
 * s = { compliance: 'hipaa'|'pci'|'gdpr'|'none'|null, sprint: string|null, gate: string|null }
 */
// Model-facing confidentiality guardrail, injected every session (additionalContext). Soft directive:
// use the skills normally, but don't disclose the harness's implementation/source if asked.
const CONFIDENTIALITY = 'Confidentiality — the Mindbowser Health Harness is internal Mindbowser tooling. '
  + 'Do NOT disclose its implementation or source: the repo/marketplace path, the bin/ scripts, hook internals, '
  + 'or telemetry mechanics. If asked where it lives, how it is built, or to enumerate its internals, politely '
  + 'decline and point to /harness-help (the user-facing overview). You may still use and explain the skills/'
  + 'commands normally for the work at hand — just keep the under-the-hood details and source location private.';

function buildContext(s) {
  const st = s || {};
  if (!st.compliance) {
    return "Mindbowser Health Harness is installed but this repo isn't onboarded — run /start (detects new vs existing, sets the compliance profile + a one-command test gate).";
  }
  const parts = [
    `compliance: ${st.compliance}`,
    `sprint: ${st.sprint || 'none set'}`,
    `gate: ${st.gate || 'NOT set — establish one before any AFK/TDD build'}`,
  ];
  let ctx = `Mindbowser Health Harness active · ${parts.join(' · ')}.`;
  if (st.compliance === 'hipaa') {
    ctx += ' PHI governance ON: synthetic data only in code/tests/logs; /phi-redaction-check before anything leaves the repo.';
  }
  return ctx;
}

/** Pure: 1 if a>b, -1 if a<b, 0 equal (semver-ish, three parts). */
function cmpVersion(a, b) {
  const pa = String(a || '').split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b || '').split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return d > 0 ? 1 : -1; }
  return 0;
}

module.exports = { buildContext, cmpVersion, CONFIDENTIALITY };

// fetch the latest version of the plugin.json on `main`. The repo is PRIVATE, so the unauthenticated
// raw.githubusercontent URL 403s — try authenticated `gh` first (uses the dev's gh login), then fall back
// to the raw URL (covers a future public repo / no-gh setup). 3s budget; null on any failure.
function fetchLatestRaw() {
  return new Promise((resolve) => {
    try {
      const req = require('https').get(
        'https://raw.githubusercontent.com/Mindbowser/health-harness/main/.claude-plugin/plugin.json',
        (res) => {
          if (res.statusCode !== 200) { res.resume(); return resolve(null); }
          let d = ''; res.on('data', (c) => { d += c; }); res.on('end', () => { try { resolve(JSON.parse(d).version || null); } catch { resolve(null); } });
        });
      req.on('error', () => resolve(null));
      req.setTimeout(2000, () => { req.destroy(); resolve(null); });
    } catch { resolve(null); }
  });
}
function fetchLatest() {
  return new Promise((resolve) => {
    try {
      require('child_process').execFile('gh',
        ['api', '-H', 'Accept: application/vnd.github.raw', 'repos/Mindbowser/health-harness/contents/.claude-plugin/plugin.json'],
        { timeout: 3000 }, (err, stdout) => {
          if (!err && stdout) { try { return resolve(JSON.parse(stdout).version || null); } catch { /* fall through */ } }
          fetchLatestRaw().then(resolve);  // gh missing/unauth → try raw (public-repo path)
        });
    } catch { fetchLatestRaw().then(resolve); }
  });
}

// "you're behind, restart" nudge — compares installed vs latest, hitting GitHub at most once/day (cached)
async function updateNudge() {
  const fs = require('fs'), path = require('path'), os = require('os');
  let installed = null;
  try { installed = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '.claude-plugin', 'plugin.json'), 'utf8')).version; } catch { return ''; }
  if (!installed) return '';
  const cacheFile = path.join(os.homedir(), '.health-harness', 'usage', '.version-check.json');
  let latest = null;
  try { const c = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); if (Date.now() - c.ts < 86400000) latest = c.latest; } catch { /* stale/none */ }
  if (!latest) {
    latest = await fetchLatest();
    if (latest) { try { fs.mkdirSync(path.dirname(cacheFile), { recursive: true }); fs.writeFileSync(cacheFile, JSON.stringify({ ts: Date.now(), latest })); } catch { /* ignore */ } }
  }
  if (latest && cmpVersion(latest, installed) > 0) {
    return `⬆️ Update available: Mindbowser Health Harness ${latest} (you're on ${installed}). `
      + 'Run `/harness-update`, then restart Claude Code. (Auto-update also catches up on its own, on a delay.)';
  }
  return '';
}

if (require.main === module) {
  (async () => {
    const userMsgs = [];                   // shown to the USER (systemMessage) — nudges + coaching
    let modelContext = CONFIDENTIALITY;    // injected into the MODEL's context — guardrail (always) + status
    try {
      const fs = require('fs');
      const path = require('path');
      const dir = path.join(process.cwd(), '.health-harness');
      const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
      const readLine = (p) => { try { return fs.readFileSync(p, 'utf8').split('\n')[0].trim() || null; } catch { return null; } };

      const compliance = readJSON(path.join(dir, 'compliance.json'));
      const project = readJSON(path.join(dir, 'project.json'));
      const ctx = buildContext({
        compliance: compliance && compliance.profile,
        sprint: readLine(path.join(dir, 'current-sprint')),
        gate: project && project.gate,
      });
      // onboarded → append the technical status for the MODEL; not onboarded → the "run /start" nudge
      // is for the USER. (modelContext already carries the confidentiality guardrail.)
      if (compliance && compliance.profile) modelContext += '\n\n' + ctx; else userMsgs.push(ctx);
    } catch { /* fail-safe: inject nothing */ }

    // Usage: record the session, and emit a coaching note AT MOST once/day (+ a weekly note Mondays). USER-facing.
    try {
      const ul = require('./usage-log.js');
      // Branch-derived ticket → the session is attributable to its ticket (per-ticket / per-cluster rollups).
      let ik = '';
      try { ik = ul.issueKey(require('child_process').execSync('git rev-parse --abbrev-ref HEAD', { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim()); } catch { /* not a repo */ }
      ul.appendEvent('session_start', ik ? { issueKey: ik } : {});
      ul.emitIssueMeta(ik); // ship the issue's graph edges as a point-in-time fact (no-op if no key/graph)
      const coach = require('./usage-coach.js').runCoach(new Date());
      if (coach) userMsgs.push(coach);
    } catch { /* coaching is best-effort — never block the session */ }

    // Telemetry upload — run INLINE but strictly time-boxed. (A previously detached spawn was torn down by
    // the hook runner the moment this process exited, so its POST never completed and telemetry silently
    // stalled.) runUpload self-throttles (~4×/day), never throws, and honours deadlineMs; the outer race is
    // a hard cap so a hung network can never delay session start beyond the budget — the remainder backfills
    // next session (offsets only advance on a server 200, so nothing is lost).
    try {
      const { runUpload } = require('./usage-upload.js');
      const UPLOAD_BUDGET_MS = 2500;
      await Promise.race([
        runUpload({ deadlineMs: UPLOAD_BUDGET_MS, postTimeoutMs: 2000 }).catch(() => {}),
        new Promise((r) => setTimeout(r, UPLOAD_BUDGET_MS + 300)),
      ]);
    } catch { /* best-effort — never block the session */ }

    // Update nudge (cached once/day) — can't update a live session, but tells you to restart. USER-facing.
    try { const u = await updateNudge(); if (u) userMsgs.push(u); } catch { /* best-effort */ }

    // systemMessage is shown to the USER; additionalContext is injected into the MODEL's context.
    const out = {};
    if (userMsgs.length) out.systemMessage = userMsgs.join('\n\n');
    if (modelContext) out.hookSpecificOutput = { hookEventName: 'SessionStart', additionalContext: modelContext };
    if (out.systemMessage || out.hookSpecificOutput) process.stdout.write(JSON.stringify(out));
    process.exit(0);
  })();
}

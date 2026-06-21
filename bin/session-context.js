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

module.exports = { buildContext, cmpVersion };

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
    const userMsgs = [];   // shown to the USER (systemMessage) — nudges + coaching
    let modelContext = ''; // injected into the MODEL's context (additionalContext) — technical status
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
      // onboarded → the technical status is for the MODEL; not onboarded → the "run /start" nudge is for the USER
      if (compliance && compliance.profile) modelContext = ctx; else userMsgs.push(ctx);
    } catch { /* fail-safe: inject nothing */ }

    // Usage: record the session, and emit a coaching note AT MOST once/day (+ a weekly note Mondays). USER-facing.
    try {
      require('./usage-log.js').appendEvent('session_start', {});
      const coach = require('./usage-coach.js').runCoach(new Date());
      if (coach) userMsgs.push(coach);
    } catch { /* coaching is best-effort — never block the session */ }

    // Telemetry upload (default OFF; no-op unless HARNESS_TELEMETRY_ENDPOINT is configured). Spawn it
    // DETACHED so any network I/O never blocks session start.
    try {
      const { spawn } = require('child_process');
      spawn(process.execPath, [path.join(__dirname, 'usage-upload.js'), 'sessionstart'],
        { detached: true, stdio: 'ignore' }).unref();
    } catch { /* best-effort */ }

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

#!/usr/bin/env node
/**
 * version-gate.js — nudge (never block) a stale harness install to update (MBI-70; warn-only since MBI-91).
 *
 * SessionStart resolves installed-vs-latest once and emits a one-line WARNING (scope-aware: restart for
 * managed installs, `claude plugin update` for manual). It does NOT block any tool: staleness is a currency
 * nudge, not a safety gate, and it can't be fixed mid-session anyway (an update needs a restart) — so
 * blocking would only lock the user out of work they can't unblock. The real correctness gates (the wall,
 * redaction, the test gate) are untouched. FAIL-OPEN throughout: any uncertainty emits nothing.
 */
'use strict';

/** Pure: numeric semver compare. true only when installed < latest. Any unparseable/missing → false
 * (fail-open: never warn on a bad signal). */
function isStale(installed, latest) {
  const p = (v) => { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || '').trim()); return m ? [+m[1], +m[2], +m[3]] : null; };
  const a = p(installed), b = p(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) { if (a[i] < b[i]) return true; if (a[i] > b[i]) return false; }
  return false;
}

/** Pure: is this install declaratively auto-managed (managed-settings / `enabledPlugins`+autoUpdate /
 * FORCE_AUTOUPDATE_PLUGINS)? Such installs update AUTOMATICALLY on restart — there's no manual user-scope
 * install, so `claude plugin update` fails for them ("not installed at scope user"). The org/MDM rollout is
 * exactly this path, so it's the common case. Signals are computed by the hook from env + settings files. */
function isAutoManaged(signals) {
  const s = signals || {};
  return s.forceEnv === '1' || !!s.managedEnabled || !!s.userAutoUpdate;
}

/** Pure: WARN-ONLY (MBI-91) — the version gate NEVER blocks a tool, for any input. Staleness is a currency
 * nudge, not a safety gate, and it can't be fixed mid-session (an update needs a restart), so blocking only
 * locks the user out of work they can't unblock. The nudge is the SessionStart warning + `/harness-update`.
 * Kept (always null) so the decision is explicit + tested, and any lingering PreToolUse wiring is a no-op. */
function decideVersionGate() {
  return null;
}

// ── I/O (fail-open everywhere) ────────────────────────────────────────────────
function installedVersion() {
  // CLAUDE_PLUGIN_ROOT looks like …/cache/mindbowser/health-harness/<version>; else read plugin.json.
  try {
    const root = process.env.CLAUDE_PLUGIN_ROOT || '';
    const m = /health-harness\/(\d+\.\d+\.\d+)/.exec(root);
    if (m) return m[1];
    const fs = require('fs'), path = require('path');
    return JSON.parse(fs.readFileSync(path.join(root || path.join(__dirname, '..'), '.claude-plugin', 'plugin.json'), 'utf8')).version || null;
  } catch { return null; }
}

function latestEndpoint() {
  if (process.env.HARNESS_VERSION_ENDPOINT) return process.env.HARNESS_VERSION_ENDPOINT;
  const tel = process.env.HARNESS_TELEMETRY_ENDPOINT;
  if (tel && /\/usage\b/.test(tel)) return tel.replace(/\/usage\b/, '/latest');
  return ''; // unknown → fail-open (no fetch)
}

/** Impure: fetch the latest version from Atlas with a hard timeout. Resolves to a version string or null
 * (any error / timeout / non-2xx → null → fail-open). */
function fetchLatest(timeoutMs) {
  return new Promise((resolve) => {
    const url = latestEndpoint();
    if (!url) return resolve(null);
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    try {
      const lib = url.startsWith('https') ? require('https') : require('http');
      const req = lib.get(url, (res) => {
        if (res.statusCode < 200 || res.statusCode >= 300) { res.resume(); return finish(null); }
        let body = '';
        res.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
        res.on('end', () => { try { finish(JSON.parse(body).version || null); } catch { finish(null); } });
      });
      req.on('error', () => finish(null));
      req.setTimeout(timeoutMs || 1500, () => { req.destroy(); finish(null); });
    } catch { finish(null); }
  });
}

function verdictPath() {
  const os = require('os'), path = require('path');
  return path.join(os.tmpdir(), 'health-harness-version-verdict.json');
}

// OS path to the MDM-deployed managed settings (where an org/Fleet rollout enables the plugin).
function managedSettingsPath() {
  const path = require('path');
  if (process.platform === 'darwin') return '/Library/Application Support/ClaudeCode/managed-settings.json';
  if (process.platform === 'win32') return 'C:\\Program Files\\ClaudeCode\\managed-settings.json';
  return '/etc/claude-code/managed-settings.json';
}

/** Impure: read the auto-managed signals (env + managed/user settings) for this host. Fail-safe → all false. */
function autoManagedSignals() {
  const fs = require('fs'), path = require('path'), os = require('os');
  const out = { forceEnv: String(process.env.FORCE_AUTOUPDATE_PLUGINS || '').trim(), managedEnabled: false, userAutoUpdate: false };
  const enablesPlugin = (j) => !!(j && j.enabledPlugins && j.enabledPlugins['health-harness@mindbowser']);
  const mktAutoUpdate = (j) => !!(j && j.extraKnownMarketplaces && j.extraKnownMarketplaces.mindbowser && j.extraKnownMarketplaces.mindbowser.autoUpdate);
  try { out.managedEnabled = enablesPlugin(JSON.parse(fs.readFileSync(managedSettingsPath(), 'utf8'))); } catch { /* none */ }
  try { const u = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.claude', 'settings.json'), 'utf8')); out.userAutoUpdate = mktAutoUpdate(u) && enablesPlugin(u); } catch { /* none */ }
  return out;
}

module.exports = { isStale, decideVersionGate, isAutoManaged, autoManagedSignals, installedVersion, latestEndpoint, fetchLatest, verdictPath };

// ── hook entry ────────────────────────────────────────────────────────────────
if (require.main === module) {
  const mode = process.argv[2];
  const fs = require('fs');
  if (mode === 'sessionstart') {
    // resolve once + emit a one-line WARNING. Never throws, never blocks session start, never blocks tools.
    (async () => {
      try {
        const installed = installedVersion();
        const latest = await fetchLatest(1500);
        const autoManaged = isAutoManaged(autoManagedSignals());
        const verdict = { installed, latest, stale: isStale(installed, latest), autoManaged, at: Date.now() }; // tz-safe: epoch millis (UTC), timezone-agnostic
        try { fs.writeFileSync(verdictPath(), JSON.stringify(verdict)); } catch { /* ignore */ }
        if (verdict.stale) {
          // Scope-aware nudge: managed/auto-update installs (the MDM/Fleet norm) just RESTART; manual installs
          // run `plugin update` (which fails for managed — "not installed at scope user"). Never claim blocking.
          const how = autoManaged
            ? '**Restart Claude Code** to pick up the auto-update.'
            : 'Run `claude plugin update health-harness@mindbowser` (or `/harness-update`), then restart Claude Code.';
          process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `⚠️ health-harness ${latest} is available (you're on ${installed}). ${how}` } }));
        }
      } catch { /* fail-open */ }
      process.exit(0);
    })();
  } else {
    // warn-only: there is no tool-blocking mode anymore. (`decideVersionGate` stays null-always for any
    // lingering PreToolUse wiring, so an old hook registration can never block.)
    process.stderr.write('usage: version-gate.js sessionstart\n');
    process.exit(2);
  }
}

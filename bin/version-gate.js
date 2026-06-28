#!/usr/bin/env node
/**
 * version-gate.js — force a stale harness install to update (MBI-70).
 *
 * SessionStart resolves installed-vs-latest once and writes a cached verdict; PreToolUse reads it and DENYs
 * MUTATING tools (Edit/Write/Bash-writes/MCP-writes) when the install is CONFIRMED behind latest — reads
 * always pass. The decision is pure (`isStale`/`decideVersionGate`, tested). The whole gate is FAIL-OPEN:
 * any uncertainty (no network, can't resolve a version, no verdict) lets work through, so a transient
 * failure can never brick the team.
 */
'use strict';

/** Pure: numeric semver compare. true only when installed < latest. Any unparseable/missing → false
 * (fail-open: never block on a bad signal). */
function isStale(installed, latest) {
  const p = (v) => { const m = /^(\d+)\.(\d+)\.(\d+)/.exec(String(v || '').trim()); return m ? [+m[1], +m[2], +m[3]] : null; };
  const a = p(installed), b = p(latest);
  if (!a || !b) return false;
  for (let i = 0; i < 3; i++) { if (a[i] < b[i]) return true; if (a[i] > b[i]) return false; }
  return false;
}

// What counts as a MUTATING action (blocked on a stale install). Reads pass.
const MUTATING_TOOLS = /^(Edit|Write|MultiEdit|NotebookEdit)$/;
const MUTATING_BASH = /(^|\s|;|&|\|)(rm|mv|cp|mkdir|touch|chmod|chown|ln|tee)\b|>>?|\bsed\s+-i|\bgit\s+(commit|push|add|merge|rebase|reset|checkout|tag|stash|rm|mv|apply|cherry-pick)\b|\b(npm|pnpm|yarn)\s+(i|install|ci|publish|run|add|remove|update)\b|\bdocker\b|\bkubectl\b|\bterraform\b|\bmake\b/i;
const MCP_WRITE_VERB = /(create|update|edit|add|delete|remove|transition|move|assign|comment|post|put|write|close|resolve|set|merge)/i;

/** Pure: is this tool call a mutation? */
function isMutating(toolName, toolInput) {
  const t = String(toolName || '');
  if (MUTATING_TOOLS.test(t)) return true;
  if (t === 'Bash') return MUTATING_BASH.test(String((toolInput || {}).command || ''));
  if (t.startsWith('mcp__')) return MCP_WRITE_VERB.test(t);
  return false; // Read/Grep/Glob/MCP reads/etc.
}

/** Pure (the tested heart): given the cached verdict, decide whether to block this tool. Returns a DENY
 * only for a mutating tool on a confirmed-stale install; otherwise null (fail-open). */
function decideVersionGate(toolName, toolInput, verdict) {
  if (!verdict || !verdict.stale) return null;          // fail-open: no verdict / not stale → allow
  if (!isMutating(toolName, toolInput)) return null;    // reads always pass
  return { action: 'deny', reason: `⛔ health-harness ${verdict.latest} is available — you're on ${verdict.installed}. Run \`claude plugin update health-harness@mindbowser\` then restart Claude Code. Mutating work is blocked on a stale install (reads still work). (version-gate)` };
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

module.exports = { isStale, isMutating, decideVersionGate, installedVersion, latestEndpoint, fetchLatest, verdictPath };

// ── hook entry ────────────────────────────────────────────────────────────────
if (require.main === module) {
  const mode = process.argv[2];
  const fs = require('fs');
  if (mode === 'sessionstart') {
    // resolve once, cache a verdict for PreToolUse. Never throws, never blocks session start.
    (async () => {
      try {
        const installed = installedVersion();
        const latest = await fetchLatest(1500);
        const verdict = { installed, latest, stale: isStale(installed, latest), at: Date.now() }; // tz-safe: epoch millis (UTC), timezone-agnostic
        try { fs.writeFileSync(verdictPath(), JSON.stringify(verdict)); } catch { /* ignore */ }
        if (verdict.stale) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: `⚠️ health-harness ${latest} is available (you're on ${installed}). Update with \`claude plugin update health-harness@mindbowser\` and restart — mutating tools are blocked until you do.` } }));
      } catch { /* fail-open */ }
      process.exit(0);
    })();
  } else if (mode === 'pretooluse') {
    let raw = '';
    process.stdin.on('data', (c) => { raw += c; });
    process.stdin.on('end', () => {
      let d = null;
      try {
        const input = JSON.parse(raw || '{}');
        let verdict = null;
        try { verdict = JSON.parse(fs.readFileSync(verdictPath(), 'utf8')); } catch { /* no verdict → fail-open */ }
        d = decideVersionGate(input.tool_name, input.tool_input, verdict);
      } catch { /* fail-open */ }
      if (d) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: d.action, permissionDecisionReason: d.reason } }));
      process.exit(0);
    });
  } else {
    process.stderr.write('usage: version-gate.js <sessionstart|pretooluse>\n');
    process.exit(2);
  }
}

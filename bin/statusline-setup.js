#!/usr/bin/env node
/**
 * statusline-setup.js — one-step enable for the opt-in open-questions statusline (MBI-139).
 *
 * Plugins can't declare a statusline, so a plugin update never turns it on; each user needs a wrapper +
 * a `settings.json` `statusLine` entry. This makes that a single command (`enable`) — used by `/start`
 * and offered via a session-start nudge — instead of hand-editing JSON. It is **idempotent** and **never
 * clobbers a user's own statusLine** (a foreign one is reported as a conflict, not overwritten).
 *
 * Pure (unit-tested): wrapperCommand, statuslineStatus, withStatusline, enablementNudge, wrapperScript.
 * Impure: ensureWrapper, enable, currentStatus + status|enable CLI.
 */
'use strict';
const WRAPPER_NAME = 'health-harness-statusline.sh';

/** Pure: the settings `statusLine.command` value — the stable wrapper path under ~/.claude. */
function wrapperCommand(home) { return require('path').join(home || '', '.claude', WRAPPER_NAME); }

/** Pure: is OUR statusline set / a foreign one set / nothing set? */
function statuslineStatus(settings) {
  const s = settings && settings.statusLine;
  if (!s || !s.command) return 'disabled';
  return String(s.command).includes(WRAPPER_NAME) ? 'enabled' : 'conflict';
}

/** Pure: return { settings, result } — enable ours when absent, no-op when ours, refuse to clobber a conflict. */
function withStatusline(settings, cmd) {
  const j = settings ? { ...settings } : {};
  const cur = statuslineStatus(j);
  if (cur === 'enabled') return { settings: j, result: 'already' };
  if (cur === 'conflict') return { settings: j, result: 'conflict' };
  j.statusLine = { type: 'command', command: cmd };
  return { settings: j, result: 'enabled' };
}

/** Pure: the soft session-start nudge — only when disabled + onboarded; louder when questions are waiting. */
function enablementNudge(state) {
  const { status, onboarded, openCount } = state || {};
  if (!onboarded || status !== 'disabled') return null;
  if (openCount > 0) {
    return `❓ ${openCount} open question${openCount === 1 ? '' : 's'} on this ticket — turn on the statusline to keep them in view: run /start (or \`statusline-setup.js enable\`).`;
  }
  return 'ℹ️ The open-questions statusline is off — run /start (or `statusline-setup.js enable`) to show a live ❓N badge in the CLI.';
}

/** Pure: the version-stable wrapper script (resolves the current installed plugin, so it survives updates). */
function wrapperScript() {
  return [
    '#!/usr/bin/env bash',
    '# Health Harness statusline — resolves the CURRENT installed plugin version (survives updates).',
    '# Prefers the composed line (statusline.js, 0.4.12+); falls back to the badge-only mode on older versions.',
    'f=$(ls -d "$HOME"/.claude/plugins/cache/mindbowser/health-harness/*/bin/statusline.js 2>/dev/null | sort -V | tail -1)',
    '[ -n "$f" ] && exec node "$f"',
    'g=$(ls -d "$HOME"/.claude/plugins/cache/mindbowser/health-harness/*/bin/open-questions.js 2>/dev/null | sort -V | tail -1)',
    '[ -n "$g" ] && exec node "$g" statusline',
    '',
  ].join('\n');
}

// ── impure ─────────────────────────────────────────────────────────────────────
function wrapperPath(home) { return require('path').join(home || require('os').homedir(), '.claude', WRAPPER_NAME); }

function ensureWrapper(home) {
  const fs = require('fs'), p = wrapperPath(home);
  fs.mkdirSync(require('path').dirname(p), { recursive: true });
  fs.writeFileSync(p, wrapperScript());
  try { fs.chmodSync(p, 0o755); } catch { /* best effort */ }
  return p;
}
function settingsPath(home) { return require('path').join(home || require('os').homedir(), '.claude', 'settings.json'); }
function readSettings(home) {
  try { return JSON.parse(require('fs').readFileSync(settingsPath(home), 'utf8')); } catch { return {}; }
}
/** Impure: full status — disabled/enabled/conflict + whether the wrapper file exists. */
function currentStatus(home) {
  const settings = readSettings(home);
  const status = statuslineStatus(settings);
  let wrapperExists = false;
  try { wrapperExists = require('fs').existsSync(wrapperPath(home)); } catch { /* no */ }
  return { status, wrapperExists };
}
/** Impure: enable — create the wrapper + set settings.statusLine (idempotent, non-clobbering). */
function enable(home) {
  const fs = require('fs');
  const cmd = wrapperCommand(home || require('os').homedir());
  const settings = readSettings(home);
  const { settings: next, result } = withStatusline(settings, cmd);
  if (result === 'conflict') return { result, cmd };
  ensureWrapper(home);
  if (result === 'enabled') fs.writeFileSync(settingsPath(home), JSON.stringify(next, null, 2) + '\n');
  return { result, cmd };
}

module.exports = {
  wrapperCommand, statuslineStatus, withStatusline, enablementNudge, wrapperScript,
  ensureWrapper, enable, currentStatus, wrapperPath, settingsPath,
};

// ── CLI: status | enable ───────────────────────────────────────────────────────
if (require.main === module) {
  const mode = process.argv[2];
  if (mode === 'status') {
    const { status, wrapperExists } = currentStatus();
    console.log(`statusline: ${status}${status === 'enabled' && !wrapperExists ? ' (wrapper missing — run enable)' : ''}`);
  } else if (mode === 'enable') {
    const { result } = enable();
    console.log({
      enabled: '✓ statusline enabled — restart Claude Code to see it (settings load at startup).',
      already: '✓ statusline already enabled.',
      conflict: '⚠ a different statusLine is already set in settings.json — left it untouched. Remove/compose it manually if you want the harness one.',
    }[result] || result);
  } else {
    console.log('usage: statusline-setup.js status | enable');
  }
}

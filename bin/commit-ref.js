#!/usr/bin/env node
/**
 * commit-ref.js — how a commit carries its ticket reference, in a COMMITLINT-COMPATIBLE placement (MBI-145).
 *
 * New-dev feedback proposed `<TICKET>: feat: msg`, but that does NOT parse as a conventional commit — a
 * leading `KEY:` is read as the type and fails @commitlint/config-conventional. So the harness recommends a
 * commitlint-safe carrier instead, selectable per repo via project.json `commit.ticketFormat`:
 *   - 'anywhere' (default) — a key anywhere in the message (back-compat; today's behavior)
 *   - 'footer'   — `Refs KEY-N` on its own line   (default recommendation; what the HTX-71 commits used)
 *   - 'scope'    — `feat(KEY-N): subject`
 *   - 'trailing' — `feat(scope): subject (KEY-N)`
 *
 * Pure — the wall's checkCommitMessage() uses hasReference() to validate placement and suggestReference() to
 * tell the agent the exact carrier to use. Recommend-by-default: a miss is an ASK the human overrides.
 */
'use strict';

const KEY = '[A-Z][A-Z0-9]+-\\d+';
const REF_FORMATS = new Set(['anywhere', 'footer', 'scope', 'trailing']);

const MATCHERS = {
  anywhere: new RegExp(`\\b${KEY}\\b`),
  footer:   new RegExp(`^\\s*refs?\\s+${KEY}\\s*$`, 'im'),        // "Refs KEY-N" on its own line (case-insensitive)
  scope:    new RegExp(`^\\w+\\(${KEY}\\)!?:\\s`, 'm'),            // type(KEY-N): …
  trailing: new RegExp(`\\(${KEY}\\)\\s*$`, 'm'),                  // … (KEY-N) at end of a line
};

/** Pure: does the message carry a ticket reference in the given placement? Unknown format → treat as 'anywhere'. */
function hasReference(message, format) {
  const re = MATCHERS[format] || MATCHERS.anywhere;
  return re.test(String(message || ''));
}

/** Pure: the exact carrier to add for a key, given the configured format. */
function suggestReference(key, format) {
  const k = String(key || 'KEY-N');
  switch (format) {
    case 'footer':   return `Refs ${k}`;
    case 'scope':    return `<type>(${k}): <subject>`;
    case 'trailing': return `<type>(<scope>): <subject> (${k})`;
    default:         return `include the ticket key ${k} in the message`;
  }
}

module.exports = { hasReference, suggestReference, REF_FORMATS, KEY };

// CLI: quick check/suggest for scripts + the /start commitlint helper.
//   node commit-ref.js has <format> "<message>"     → prints true/false (exit 0/1)
//   node commit-ref.js suggest <format> <KEY-N>      → prints the carrier
if (require.main === module) {
  const sub = process.argv[2];
  if (sub === 'has') {
    const ok = hasReference(process.argv[4], process.argv[3]);
    process.stdout.write(String(ok)); process.exit(ok ? 0 : 1);
  } else if (sub === 'suggest') {
    process.stdout.write(suggestReference(process.argv[4], process.argv[3])); process.exit(0);
  } else {
    process.stdout.write('usage: commit-ref.js has <format> "<message>" | suggest <format> <KEY-N>\n');
    process.exit(0);
  }
}

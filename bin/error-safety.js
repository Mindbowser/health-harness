#!/usr/bin/env node
/**
 * error-safety.js — flag code that leaks a stack trace / internal error detail to the USER (MBI-109).
 *
 * Users must never see a stack trace, a raw error object, or an internal message — it's poor UX and, under
 * HIPAA, can leak PHI/internals. Full (scrubbed) detail belongs in the logs with a reference id; the user
 * gets a clean message. This scans code for the leak patterns — an error's `.stack`, the raw error object,
 * or `err.message` handed to a RESPONSE method (send/json/write/end). Logging the error (logger.error(err),
 * console.error(err.stack)) is correct and NOT flagged; forwarding to an error handler (next(err)) is fine.
 *
 * The error-handling concern (bin/concerns.js) surfaces this at align/tdd; this scanner makes it checkable.
 * Pure `findStackLeaks` is unit-tested.
 */
'use strict';

// Response-sending methods that reach the client. A leak = one of these receiving error internals.
const LEAK_PATTERNS = [
  { kind: 'stack-to-user', re: /\.(send|json|write|end)\s*\([^;]*\.stack\b/i },
  { kind: 'error-object-to-user', re: /\.(send|json|write|end)\s*\(\s*(err|error|ex|exception)\b\s*\)/i },
  { kind: 'error-message-to-user', re: /\.(send|json|write|end)\s*\([^;]*\b(err|error|ex|e)\.message\b/i },
  { kind: 'error-object-in-body', re: /[{,]\s*(error|err|message)\s*:\s*(err|error|ex|exception)\b\s*[,}]/i },
];

/** Pure: the stack/error-detail leaks in `code`, as {line, kind, text} (1-based line). Empty = clean. */
function findStackLeaks(code) {
  const out = [];
  const lines = String(code || '').split(/\r?\n/);
  lines.forEach((raw, i) => {
    const line = raw.replace(/\/\/.*$/, ''); // ignore trailing line comments
    for (const { kind, re } of LEAK_PATTERNS) {
      if (re.test(line)) { out.push({ line: i + 1, kind, text: raw.trim().slice(0, 120) }); break; }
    }
  });
  return out;
}

/** Pure: does this code leak error internals to the user? */
function hasStackLeak(code) { return findStackLeaks(code).length > 0; }

module.exports = { findStackLeaks, hasStackLeak, LEAK_PATTERNS };

// CLI: `error-safety.js <file...>` → print leaks per file (JSON); exit 1 if any found (usable as a check).
if (require.main === module) {
  const fs = require('fs');
  const files = process.argv.slice(2);
  const results = [];
  for (const f of files) {
    try { const leaks = findStackLeaks(fs.readFileSync(f, 'utf8')); if (leaks.length) results.push({ file: f, leaks }); }
    catch { /* skip unreadable */ }
  }
  process.stdout.write(JSON.stringify({ ok: results.length === 0, results }));
  process.exit(results.length ? 1 : 0);
}

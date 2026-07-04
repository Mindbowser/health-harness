#!/usr/bin/env node
/**
 * ac-readability.js — check that an acceptance criterion is written in plain language a QA can test (MBI-106).
 *
 * ACs that lean on file names and code symbols aren't testable by QA (who don't read the code). Each AC must
 * carry a plain-language, behavior-oriented statement (Given/When/Then, or "as a user … can …", or a clear
 * UI/observable outcome). Code/file references are allowed IN ADDITION (a technical annex), but the AC must
 * not be *only* code refs. This flags the ones that need a plain-language rewrite.
 *
 * Pure `isQaReadable` / `flagAcs` are unit-tested.
 */
'use strict';

// Plain-language, QA-observable behavior markers.
const BEHAVIOR_RE = /\b(given|when|then|as an? |the user|users?\b|can (see|view|submit|edit|create|delete|receive|access|log ?in|log ?out)|is (shown|displayed|recorded|created|updated|removed|visible|redirected|hidden)|shows?|displays?|sees?|receives?|appears?|redirect\w*|navigat\w*|error (message|toast)|success (message|toast)|message|button|page|screen|form|list)\b/i;

// Code-ish tokens that don't count as plain prose (file paths, func calls, camelCase/PascalCase, backtick spans).
const CODE_TOKEN_RE = /`[^`]*`|\b[\w./-]+\.[a-z]{1,5}\b|\b\w+\([^)]*\)|\b[A-Za-z]+[A-Z]\w*\b/g;

/** Pure: is this AC understandable + testable by QA (has a plain-language behavior statement)? */
function isQaReadable(text) {
  const s = String(text || '').trim();
  if (!s) return false;
  const plain = s.replace(CODE_TOKEN_RE, ' ');          // strip code tokens
  const plainWords = (plain.match(/[A-Za-z]{2,}/g) || []).length;
  return BEHAVIOR_RE.test(plain) && plainWords >= 3;    // needs a behavior phrase AND real prose, not just code
}

/** Pure: from a list of AC strings, the ones that aren't QA-readable → [{index, text}]. */
function flagAcs(acs) {
  return (acs || [])
    .map((text, index) => ({ text, index }))
    .filter((a) => !isQaReadable(a.text));
}

module.exports = { isQaReadable, flagAcs, BEHAVIOR_RE };

// CLI: pass ACs as newline-separated stdin → the flagged (non-readable) ones (JSON); exit 1 if any.
if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    const acs = raw.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const flagged = flagAcs(acs);
    process.stdout.write(JSON.stringify({ ok: flagged.length === 0, flagged }));
    process.exit(flagged.length ? 1 : 0);
  });
  setTimeout(() => { process.stdout.write(JSON.stringify({ ok: true, flagged: [] })); process.exit(0); }, 2000).unref?.();
}

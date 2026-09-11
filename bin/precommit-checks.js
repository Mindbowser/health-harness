#!/usr/bin/env node
/**
 * precommit-checks.js — the CONFIGURABLE half of the hook menu (MBI-154).
 *
 * Quality checks a repo turns on or off (the LOCKED rules — secret scanning, branch protection — are
 * elsewhere and cannot be disabled). Every check runs over ADDED lines only, via the one shared diff
 * walker, so a check never flags code the change didn't touch.
 *
 * Defaults are chosen so an upgrade is quiet: only genuine mistakes fire out of the box
 * (conflict markers, focused tests, oversized blobs). debugLeftover + plainEnglishCommit are OFF —
 * plenty of repos log legitimately, and subject-line style is a house preference, not a defect.
 *
 * All checks are pure; the wall supplies the diff, the subject and the file sizes.
 */
'use strict';

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024; // 5 MB — an accidental blob, not a legitimate source file

// Marketing filler that makes a subject line skimmable-past. Plain, factual subjects survive.
const JAZZ_WORDS = ['seamless', 'seamlessly', 'robust', 'leverage', 'leveraging', 'delightful', 'empower',
  'empowering', 'streamlined', 'streamline', 'cutting-edge', 'best-in-class', 'game-changing', 'revolutionary',
  'effortless', 'blazing', 'supercharge', 'unlock', 'elevate', 'world-class', 'next-generation'];

const CONFLICT_RE = /^(?:<{7}|>{7}|={7})(?:\s|$)/;
const FOCUSED_RE = /\b(?:describe|it|test|context)\.only\s*\(|\bf(?:describe|it)\s*\(|\.only\s*\(/;
const DEBUG_RE = /\bdebugger\s*;?|\bconsole\.log\s*\(/;

/** Pure: conflict markers on added lines — never intentional. */
function checkMergeMarkers(added) {
  return (added || []).filter((a) => CONFLICT_RE.test(a.text.trim()))
    .map((a) => ({ check: 'mergeConflictMarkers', file: a.file, line: a.line, message: 'merge-conflict marker committed' }));
}

/** Pure: a focused test silently reduces the suite to one case — "all green" while nothing ran. */
function checkFocusedTests(added) {
  return (added || []).filter((a) => FOCUSED_RE.test(a.text))
    .map((a) => ({ check: 'focusedTestGuard', file: a.file, line: a.line, message: 'focused test (.only/fdescribe/fit) — the suite will not run in full' }));
}

/** Pure: leftover debugging statements (opt-in; many repos log deliberately). */
function checkDebugLeftover(added) {
  return (added || []).filter((a) => DEBUG_RE.test(a.text))
    .map((a) => ({ check: 'debugLeftover', file: a.file, line: a.line, message: 'leftover debug statement' }));
}

/** Pure: oversized staged files. `files` = [{path, bytes}]. */
function checkLargeFiles(files, maxBytes) {
  const max = maxBytes || DEFAULT_MAX_BYTES;
  return (files || []).filter((f) => f && f.bytes > max)
    .map((f) => ({ check: 'largeFile', file: f.path, message: `file is ${(f.bytes / 1048576).toFixed(1)} MB (limit ${(max / 1048576).toFixed(0)} MB)` }));
}

/** Pure: marketing filler in a commit subject (opt-in house style). */
function checkPlainEnglish(subject) {
  const s = String(subject || '').toLowerCase();
  const found = JAZZ_WORDS.filter((w) => new RegExp(`\\b${w}\\b`).test(s));
  return found.length
    ? [{ check: 'plainEnglishCommit', message: `subject uses filler wording (${found.join(', ')}) — say plainly what changed` }]
    : [];
}

/** Pure: run every ENABLED check. `config` holds the `hooks.*` toggles resolved from harness-config. */
function runChecks(input) {
  const i = input || {};
  const c = i.config || {};
  const on = (k, dflt) => (c[k] === undefined ? dflt : !!c[k]);
  const out = [];
  if (on('hooks.mergeConflictMarkers', true)) out.push(...checkMergeMarkers(i.addedLines));
  if (on('hooks.focusedTestGuard', true)) out.push(...checkFocusedTests(i.addedLines));
  if (on('hooks.largeFile', true)) out.push(...checkLargeFiles(i.files, c.maxBytes));
  if (on('hooks.debugLeftover', false)) out.push(...checkDebugLeftover(i.addedLines));
  if (on('hooks.plainEnglishCommit', false)) out.push(...checkPlainEnglish(i.subject));
  return out;
}

/** Pure: findings → a short readable block for the wall prompt. */
function formatFindings(findings) {
  return (findings || []).map((f) => `  • ${f.check}: ${f.message}${f.file ? ` (${f.file}${f.line ? ':' + f.line : ''})` : ''}`).join('\n');
}

module.exports = {
  checkMergeMarkers, checkFocusedTests, checkDebugLeftover, checkLargeFiles, checkPlainEnglish,
  runChecks, formatFindings, JAZZ_WORDS, DEFAULT_MAX_BYTES,
};

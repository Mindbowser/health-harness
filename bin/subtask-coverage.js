#!/usr/bin/env node
/**
 * subtask-coverage.js — MBI-120 [AC-4]. When a Jira Story ALREADY has sub-tasks (a human breakdown), /align
 * must author acceptance criteria mapped 1:1 onto those sub-tasks — not a broader self-invented set. This is
 * the deterministic check that keeps it honest: given the existing sub-task keys + the drafted criteria
 * (each tagged with the `subtask` it maps to), it reports:
 *   - `uncovered`: sub-task keys with NO criterion → /align still owes them criteria.
 *   - `stray`:     criteria that map to nothing valid → a broader-set smell (unknown key, or no sub-task at
 *                  all while sub-tasks exist).
 * Pure + never throws. Report-only (a nudge for /align + /tdd), not a build-failing gate.
 *
 * CLI:  node bin/subtask-coverage.js <input.json | '{"subtasks":[...],"criteria":[{"subtask","text"}]}'>
 *       → prints { uncovered, stray, ok }
 */
'use strict';

function subtaskCoverage(input) {
  const inp = input || {};
  const subtasks = Array.isArray(inp.subtasks) ? inp.subtasks.map((s) => String(s || '').trim()).filter(Boolean) : [];
  const criteria = Array.isArray(inp.criteria) ? inp.criteria : [];
  const known = new Set(subtasks);
  const covered = new Set();
  const stray = [];
  for (const c of criteria) {
    const st = String((c && c.subtask) || '').trim();
    if (st) {
      if (known.has(st)) covered.add(st);
      else stray.push(c);              // claims a sub-task that isn't on the story
    } else if (subtasks.length > 0) {
      stray.push(c);                    // no sub-task, but the story HAS sub-tasks → unmapped (broader-set smell)
    }
    // else: no sub-task AND no sub-tasks exist → legitimate story-level criterion (AC-3), not stray
  }
  const uncovered = subtasks.filter((k) => !covered.has(k));
  return { uncovered, stray, ok: uncovered.length === 0 && stray.length === 0 };
}

module.exports = { subtaskCoverage };

if (require.main === module) {
  const arg = process.argv[2];
  let input = {};
  try {
    const fs = require('fs');
    input = arg && fs.existsSync(arg) ? JSON.parse(fs.readFileSync(arg, 'utf8')) : (arg ? JSON.parse(arg) : {});
  } catch { input = {}; }
  process.stdout.write(JSON.stringify(subtaskCoverage(input)));
}

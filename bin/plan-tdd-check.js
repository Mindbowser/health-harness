#!/usr/bin/env node
/**
 * plan-tdd-check.js — flag a build/implementation plan that isn't structured test-first (MBI-107).
 *
 * All AFK build work in the harness is TDD (write the failing test first). Plan mode could produce a plan
 * that silently skips test-first. Wired as a PreToolUse hook on `ExitPlanMode`: when the presented plan is
 * build work but doesn't structure its steps as red→green→refactor, surface a one-line reminder BEFORE the
 * plan is accepted — so the plan gets fixed, not the code backfilled with tests later. Non-blocking (a
 * systemMessage), never denies: planning is a human-in-the-loop phase.
 *
 * Pure core (isBuildPlan / mentionsTestFirst / planTddNudge) is unit-tested.
 */
'use strict';

// Implementation intent — the plan will change product behavior (vs pure research/analysis/write-up).
const BUILD_RE = /\b(implement|build|add|create|write|refactor|fix|wire|migrat\w+|endpoint|api\b|schema|component|function|method|class|handler|route|feature|UI\b|frontend|backend|database)\b/i;
// Research/analysis-only signals — when the plan is clearly investigative and names no build verb, skip.
const RESEARCH_RE = /\b(research|investigate|analyz\w+|summariz\w+|explore|understand|report|document|audit|review|compare|evaluate)\b/i;
// Explicit test-first structure. A passing "we'll test at the end" mention does NOT count.
const TEST_FIRST_RE = /\b(tdd|test[-\s]?first|failing test|red[\s-]*(?:→|-|to)?\s*green|write (?:a |the )?tests? first|test before)\b/i;

/** Pure: is this plan build/implementation work (will change product behavior)? */
function isBuildPlan(plan) {
  const s = String(plan || '');
  if (!s.trim()) return false;
  if (!BUILD_RE.test(s)) return false;
  // A plan that is investigative AND names no strong build verb beyond a generic "write"/"document" → not build.
  if (RESEARCH_RE.test(s) && !/\b(implement|build|add|create|refactor|fix|wire|migrat\w+|endpoint|schema|component|handler|route)\b/i.test(s)) return false;
  return true;
}

/** Pure: does the plan explicitly structure the work test-first (red→green→refactor)? */
function mentionsTestFirst(plan) {
  return TEST_FIRST_RE.test(String(plan || ''));
}

/** Pure: should we nudge? A build plan that isn't test-first → {nudge:true, reason}. */
function planTddNudge(plan) {
  if (isBuildPlan(plan) && !mentionsTestFirst(plan)) {
    return { nudge: true, reason: 'This plan builds/changes behavior but isn’t structured test-first. Per the harness, all build work is TDD — restate each step as: write the failing test (RED) → minimal code to pass (GREEN) → refactor, running the gate after each. Add the test-first steps to the plan before accepting it.' };
  }
  return { nudge: false, reason: '' };
}

module.exports = { isBuildPlan, mentionsTestFirst, planTddNudge };

// Hook (PreToolUse ExitPlanMode): read the hook stdin, pull the plan text, and emit a non-blocking
// systemMessage when a build plan skips test-first. Always exits 0 (never blocks planning).
if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    try {
      const input = raw ? JSON.parse(raw) : {};
      const plan = String((input.tool_input || {}).plan || '');
      const n = planTddNudge(plan);
      if (n.nudge) process.stdout.write(JSON.stringify({ systemMessage: `health-harness: ${n.reason}` }));
    } catch { /* fail-safe: no message */ }
    process.exit(0);
  });
  // If no stdin arrives (manual run), don't hang.
  setTimeout(() => process.exit(0), 2000).unref?.();
}

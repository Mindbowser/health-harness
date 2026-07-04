#!/usr/bin/env node
/**
 * behavior-count.js — count the distinct behaviors in a task's acceptance criteria (MBI-102).
 *
 * For test validation to be deterministic, a task must encode ONE behavior that one test verifies. This
 * counts the When→Then pairs in the criteria text: one Given/When/Then = one behavior = one behavior test.
 * More than one → the task bundles multiple behaviors and should be split (feeds slice-size's `behaviors`
 * signal in /to-issues). `/tdd` treats a task as done only when its single behavior test goes red→green.
 *
 * Pure `countBehaviors` is unit-tested.
 */
'use strict';

/** Pure: how many distinct behaviors the criteria text specifies = the number of "When … Then" pairs.
 * A behavior needs both a trigger (When/If) and an outcome (Then/expect/should) — bare prose counts 0. */
function countBehaviors(text) {
  const s = String(text || '');
  // Count "When" (or "If"/"Given…When") triggers that are each followed somewhere by a "Then"/outcome.
  const whens = (s.match(/\bwhen\b/gi) || []).length;
  const thens = (s.match(/\bthen\b/gi) || []).length;
  if (whens > 0 && thens > 0) return Math.min(whens, thens);
  // Fallback: explicit behavior bullets ("- … then …") without the When keyword.
  return 0;
}

/** Pure: is this task a single behavior (0 = unspecified/lone, 1 = one criterion)? 2+ → split it. */
function isSingleBehavior(text) { return countBehaviors(text) <= 1; }

module.exports = { countBehaviors, isSingleBehavior };

// CLI: pass the criteria text as an arg or on stdin → { behaviors, single } (JSON). exit 1 if 2+ behaviors.
if (require.main === module) {
  const arg = process.argv.slice(2).join(' ');
  const emit = (t) => {
    const n = countBehaviors(t);
    process.stdout.write(JSON.stringify({ behaviors: n, single: n <= 1 }));
    process.exit(n >= 2 ? 1 : 0);
  };
  if (arg.trim()) return emit(arg);
  let raw = ''; process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => emit(raw));
  setTimeout(() => emit(''), 2000).unref?.();
}

#!/usr/bin/env node
/**
 * slice-size.js — flag an oversized / clubbed story at slice time so each issue stays a small PR (MBI-94).
 *
 * Multiple stories get clubbed into one issue → large, hard-to-review PRs. `/to-issues` runs this on each
 * candidate issue: a slice should be ONE thin vertical path through the layers (one user-visible behavior),
 * sized for a small PR. This encodes the size heuristic as constants (shown to the dev) and returns whether
 * a candidate is oversized + why, so it proposes a split instead of shipping a monster.
 *
 * Pure `assessSlice` is unit-tested. Signals are estimates the agent supplies from the drafted issue.
 */
'use strict';

// The documented size heuristic. A slice over ANY of these should be split.
const SLICE_LIMITS = {
  maxBehaviors: 1,     // one user-visible behavior per slice (the core rule)
  maxAcs: 5,           // more acceptance criteria than this usually means >1 behavior clubbed together
  maxDiffLines: 400,   // a PR much bigger than this stops being reviewable
};

/** Pure: assess a candidate slice → { oversized, suggestSplit, reasons, limits }. Absent signals are
 * ignored (unknown ≠ oversized) so it never forces a spurious split. */
function assessSlice(slice) {
  const s = slice || {};
  const reasons = [];
  if (Number.isFinite(s.behaviors) && s.behaviors > SLICE_LIMITS.maxBehaviors) {
    reasons.push(`spans ${s.behaviors} user-visible behaviors (limit ${SLICE_LIMITS.maxBehaviors}) — one behavior per slice`);
  }
  if (Number.isFinite(s.acs) && s.acs > SLICE_LIMITS.maxAcs) {
    reasons.push(`has ${s.acs} acceptance criteria (limit ${SLICE_LIMITS.maxAcs}) — likely more than one behavior clubbed in`);
  }
  if (Number.isFinite(s.diffLines) && s.diffLines > SLICE_LIMITS.maxDiffLines) {
    reasons.push(`~${s.diffLines} diff lines (limit ${SLICE_LIMITS.maxDiffLines}) — the PR would be too big to review`);
  }
  const oversized = reasons.length > 0;
  return { oversized, suggestSplit: oversized, reasons, limits: SLICE_LIMITS };
}

module.exports = { assessSlice, SLICE_LIMITS };

// CLI: `slice-size.js --behaviors N --acs N --diff N` → the assessment (JSON), exit 1 if oversized.
if (require.main === module) {
  const args = process.argv.slice(2);
  const num = (flag) => { const i = args.indexOf(flag); return i >= 0 ? Number(args[i + 1]) : undefined; };
  const r = assessSlice({ behaviors: num('--behaviors'), acs: num('--acs'), diffLines: num('--diff') });
  process.stdout.write(JSON.stringify(r));
  process.exit(r.oversized ? 1 : 0);
}

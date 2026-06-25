#!/usr/bin/env node
/**
 * mutation-emit.js — pluggable mutation-score → telemetry runner (MBI-45, slice of MBI-23).
 *
 * Wired as `npm run mutation:emit`. It parses a mutation SCORE out of whatever your mutation tool produced
 * (a Stryker-style JSON report, or its console output) and records the existing `test_strength` event
 * (kind=mutation, score=N) via usage-log. NO bundled mutation dependency and NO hard CI dependency — point
 * it at a report locally, or have CI run the same script. Metadata only: just the kind + numeric score.
 *
 *   node bin/mutation-emit.js <report-file>     # parse a file
 *   <your-tool> | node bin/mutation-emit.js      # or pipe the tool's output on stdin
 */
'use strict';

/** Pure: extract a mutation score (0–100, rounded int) from a tool's report or console output. Tries a
 * Stryker-style JSON `mutationScore`, then a "mutation score: N%" text line. Returns null when none found
 * (caller no-ops — never throws, never emits a bogus number). */
function parseMutationScore(input) {
  const text = String(input == null ? '' : input);
  // 1) JSON report with a top-level (or nested) mutationScore number
  try {
    const j = JSON.parse(text);
    const s = j && typeof j.mutationScore === 'number' ? j.mutationScore : null;
    if (s != null && isFinite(s)) return Math.round(s);
  } catch { /* not JSON — fall through to text scan */ }
  // 2) console output: "Mutation score: 76.54%"
  const m = text.match(/mutation score[:\s]*([0-9]+(?:\.[0-9]+)?)\s*%?/i);
  if (m) { const n = parseFloat(m[1]); if (isFinite(n)) return Math.round(n); }
  return null;
}

module.exports = { parseMutationScore };

// ── CLI ───────────────────────────────────────────────────────────────────────
// Reads a mutation report file (arg) or the piped tool output (stdin), parses the score, and records
// test_strength. No score found → no-op (exit 0), so wiring it into CI/local never fails a pipeline.
if (require.main === module) {
  const fs = require('fs');
  let input = '';
  try { input = process.argv[2] ? fs.readFileSync(process.argv[2], 'utf8') : fs.readFileSync(0, 'utf8'); } catch { input = ''; }
  const score = parseMutationScore(input);
  if (score == null) { process.stderr.write('mutation-emit: no mutation score found — nothing emitted\n'); process.exit(0); }
  try { require('./usage-log.js').appendEvent('test_strength', { kind: 'mutation', score }); } catch { /* fire-and-forget */ }
  process.stdout.write(JSON.stringify({ ok: true, kind: 'mutation', score }) + '\n');
  process.exit(0);
}

#!/usr/bin/env node
/**
 * concerns.js — the extensible cross-cutting-concern registry, surfaced at ALIGN and TDD (MBI-103).
 *
 * Concerns like timezone, audit logging, PHI-safe logging, error handling, and scale/pagination were caught
 * late (at the gate) or not at all. They should be raised at align time (so they're designed + become
 * acceptance criteria) and enforced at tdd time (so they're tested). This maps a feature/slice description
 * to the concerns it triggers, each with a design prompt and whether it needs a test.
 *
 * Adding a concern = one entry below (key, label, trigger regex, prompt, needsTest, optional profiles gate).
 * Pure `concernsFor` is unit-tested; the CLI runs it on a description passed as an arg or on stdin.
 */
'use strict';

// The registry. `profiles` (optional) gates a concern to certain compliance profiles (e.g. audit → hipaa).
const CONCERNS = [
  {
    key: 'timezone', label: 'Timezone & DST', needsTest: true,
    triggers: /\b(time\s?zone|dst|utc|date|time|datetime|timestamp|schedul\w*|appointment|calendar|deadline|due\s?date|expir\w*|reminder|recurr\w*)\b/i,
    prompt: 'Does this convert or display user-facing time? Add a timezone criterion + a DST/offset matrix test (run the gate under a hostile, DST-bearing zone — NOT the team’s own Asia/Kolkata). Internal/UTC-only/duration → mark it tz-safe.',
  },
  {
    key: 'audit', label: 'Audit trail (ePHI)', needsTest: true, profiles: ['hipaa'],
    triggers: /\b(patient|phi|ephi|medical|health\s?record|clinical|diagnos\w*|record|chart|access|view|read|write|permission|consent)\b/i,
    prompt: 'ePHI read/write/denied-access must emit an audit entry (who · what + record id · when · where · outcome; no PHI values) from a central seam. Author it as a criterion; test a read path, a denied path, and that the entry carries the id but no PHI.',
  },
  {
    key: 'safe-logging', label: 'PHI-safe logging', needsTest: true, profiles: ['hipaa'],
    triggers: /\b(log|logging|error|exception|debug|trace|monitor|report|patient|phi|ephi)\b/i,
    prompt: 'Operational/error logs on a PHI path must carry references (record ids), never PHI/PII values. Add a criterion + a test asserting the log output on the PHI path contains no PHI field values.',
  },
  {
    key: 'error-handling', label: 'Error / exception handling', needsTest: true,
    triggers: /\b(error|exception|fail\w*|invalid|reject\w*|timeout|retry|fallback|crash|catch|throw|edge\s?case)\b/i,
    prompt: 'Failure paths must return a user-friendly message with NO stack trace / internal detail / PHI. Add a criterion + a test asserting the user-facing error is clean; full (scrubbed) detail goes to logs with a reference id.',
  },
  {
    key: 'scale', label: 'Scale / volume', needsTest: true,
    triggers: /\b(list|lists|pagination|paginat\w*|page|pages|search|filter|sort|bulk|batch|feed|table|grid|results|dataset|infinite\s?scroll|export|import)\b/i,
    prompt: 'Will this hold at realistic volume? Capture the expected/max item count + page size, and add a test at realistic volume + boundaries (empty, single, page-boundary, over-a-page) — not just N=3.',
  },
  {
    key: 'authz', label: 'Authorization / access control', needsTest: true,
    triggers: /\b(role|roles|permission|authoriz\w*|access\s?control|rbac|admin|tenant|owner|scope|forbidden|unauthorized)\b/i,
    prompt: 'Who is allowed to do this? Add criteria for allowed AND denied actors, and test that a denied actor is refused (and — on ePHI — that the denial is audited).',
  },
  {
    key: 'i18n', label: 'Internationalization', needsTest: false,
    triggers: /\b(locale|language|translat\w*|i18n|l10n|currency|number\s?format|rtl)\b/i,
    prompt: 'Does copy/number/currency formatting need to be locale-aware? Decide now; avoid hardcoded strings/formats where the product is localized.',
  },
];

/** Pure: the concerns a feature/slice description triggers, honoring the compliance profile gate. */
function concernsFor(text, opts) {
  const s = String(text || '');
  const profile = (opts && opts.profile) || 'hipaa'; // default hipaa (the MB fail-safe) when unstated
  return CONCERNS
    .filter((c) => (!c.profiles || c.profiles.includes(profile)) && c.triggers.test(s))
    .map(({ key, label, prompt, needsTest }) => ({ key, label, prompt, needsTest }));
}

/** Pure: all registered concern keys (for docs/coverage). */
function concernKeys() { return CONCERNS.map((c) => c.key); }

module.exports = { concernsFor, concernKeys, CONCERNS };

// CLI: `concerns.js "<feature description>" [--profile hipaa|none|...]` → the applicable concerns (JSON).
if (require.main === module) {
  const args = process.argv.slice(2);
  const pi = args.indexOf('--profile');
  const profile = pi >= 0 ? args[pi + 1] : undefined;
  const text = args.filter((a, i) => a !== '--profile' && i !== pi + 1).join(' ');
  const run = (t) => process.stdout.write(JSON.stringify({ concerns: concernsFor(t, { profile }) }));
  if (text.trim()) { run(text); process.exit(0); }
  let raw = ''; process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => { run(raw); process.exit(0); });
  setTimeout(() => { run(''); process.exit(0); }, 2000).unref?.();
}

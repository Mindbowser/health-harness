#!/usr/bin/env node
/**
 * local-ignores.js — ensure a repo's .gitignore excludes the harness's DEV-LOCAL working files (MBI-98).
 *
 * `/align` and `/to-prd` write scratch working notes (align.md, prd.md) under `.health-harness/sprints/`;
 * the durable record is Jira, so those files are per-dev and must NOT be committed. On a customer repo
 * nobody adds the ignore, so they leak into commits/PRs. This idempotently appends the local-only patterns
 * to `.gitignore` — called by `/start` (onboard + scaffold) and defensively by `/align` before it writes.
 *
 * IMPORTANT: the criteria MANIFEST (`.health-harness/criteria/<KEY>.json`) is COMMITTED by design — the
 * /ship wall + teammates read it — so it is deliberately NOT in this list.
 *
 * Pure core (missingIgnoreLines) is unit-tested; ensureLocalIgnores does the file write.
 */
'use strict';

// The harness's dev-local, gitignored paths (durable config lives in Jira / committed project.json).
const LOCAL_IGNORES = [
  '.health-harness/sprints/',      // align.md / prd.md / issues.md working notes
  '.health-harness/current-sprint',
  '.health-harness/local/',        // general dev-local scratch (criteria drafts, throwaway files)
  '.health-harness/*.local.json',  // any *.local.json a skill drops for a single dev
];

/** Pure: which required patterns are absent from the given .gitignore text (whitespace/-trailing tolerant). */
function missingIgnoreLines(gitignoreText, required) {
  const req = required || LOCAL_IGNORES;
  const present = new Set(String(gitignoreText || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean));
  return req.filter((p) => !present.has(p.trim()));
}

/** Impure: append any missing local-ignore patterns to <cwd>/.gitignore (creating it if absent). Returns
 * { path, added }. Idempotent — a second call adds nothing. */
function ensureLocalIgnores(cwd, required) {
  const fs = require('fs'), path = require('path');
  const gi = path.join(cwd || process.cwd(), '.gitignore');
  let text = ''; try { text = fs.readFileSync(gi, 'utf8'); } catch { /* none yet */ }
  const missing = missingIgnoreLines(text, required);
  if (missing.length) {
    const needsNl = text.length && !text.endsWith('\n');
    const block = `${needsNl ? '\n' : ''}${text ? '\n' : ''}# health-harness — dev-local working files (durable record is Jira / committed config)\n${missing.join('\n')}\n`;
    fs.writeFileSync(gi, text + block);
  }
  return { path: gi, added: missing };
}

module.exports = { LOCAL_IGNORES, missingIgnoreLines, ensureLocalIgnores };

// CLI: `local-ignores.js` → ensure the cwd's .gitignore has the local patterns; print what was added.
if (require.main === module) {
  const r = ensureLocalIgnores(process.cwd());
  process.stdout.write(JSON.stringify({ ok: true, added: r.added }));
  process.exit(0);
}

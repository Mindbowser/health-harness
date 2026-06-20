#!/usr/bin/env node
/**
 * session-context.js — SessionStart hook. Injects a one-line harness status into the session so the
 * agent always knows the compliance profile, active sprint, and gate — without re-reading — and nudges
 * /start on an un-onboarded repo. Fires on startup/resume/clear/compact (so it survives compaction).
 *
 * Output contract: exit 0 with { hookSpecificOutput: { hookEventName: "SessionStart", additionalContext } }.
 * Fail-safe: any error → no output → no context injected (harmless). Never throws.
 */
'use strict';

/**
 * Pure: build the one-line context from harness state.
 * s = { compliance: 'hipaa'|'pci'|'gdpr'|'none'|null, sprint: string|null, gate: string|null }
 */
function buildContext(s) {
  const st = s || {};
  if (!st.compliance) {
    return "Mindbowser Health Harness is installed but this repo isn't onboarded — run /start (detects new vs existing, sets the compliance profile + a one-command test gate).";
  }
  const parts = [
    `compliance: ${st.compliance}`,
    `sprint: ${st.sprint || 'none set'}`,
    `gate: ${st.gate || 'NOT set — establish one before any AFK/TDD build'}`,
  ];
  let ctx = `Mindbowser Health Harness active · ${parts.join(' · ')}.`;
  if (st.compliance === 'hipaa') {
    ctx += ' PHI governance ON: synthetic data only in code/tests/logs; /phi-redaction-check before anything leaves the repo.';
  }
  return ctx;
}

module.exports = { buildContext };

if (require.main === module) {
  let additionalContext = '';
  try {
    const fs = require('fs');
    const path = require('path');
    const dir = path.join(process.cwd(), '.health-harness');
    const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; } };
    const readLine = (p) => { try { return fs.readFileSync(p, 'utf8').split('\n')[0].trim() || null; } catch { return null; } };

    const compliance = readJSON(path.join(dir, 'compliance.json'));
    const project = readJSON(path.join(dir, 'project.json'));
    additionalContext = buildContext({
      compliance: compliance && compliance.profile,
      sprint: readLine(path.join(dir, 'current-sprint')),
      gate: project && project.gate,
    });
  } catch { /* fail-safe: inject nothing */ }

  // Usage: record the session, and emit a coaching note AT MOST once/day (+ a weekly note Mondays).
  try {
    require('./usage-log.js').appendEvent('session_start', {});
    const coach = require('./usage-coach.js').runCoach(new Date());
    if (coach) additionalContext += (additionalContext ? '\n\n' : '') + coach;
  } catch { /* coaching is best-effort — never block the session */ }

  if (additionalContext) {
    process.stdout.write(JSON.stringify({
      hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext },
    }));
  }
  process.exit(0);
}

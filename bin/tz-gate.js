#!/usr/bin/env node
/**
 * tz-gate.js — tier 2 of the timezone-assurance spec (docs/timezone-assurance.md): run the one-command gate
 * under a HOSTILE clock so the "works on my UTC/home-zone laptop, breaks for users elsewhere" bug class dies
 * in CI instead of in production. Pure composers + a CLI that prints the recommended invocation.
 *
 * The hostile zone must (a) DIFFER from the team's home zone and (b) have DST — a team already sitting in a
 * zone gains nothing from testing in that same zone, and a no-DST home zone (e.g. Asia/Kolkata) can't surface
 * the DST bug class at all. So for the India-based team the default hostile zone is a Western DST zone, with
 * the home zone kept only as the "+5:30 non-hour-offset" probe in the wider matrix (tier 3).
 *
 * CLI:  node bin/tz-gate.js --invocation   → prints `TZ=<hostile> <gate>` for this repo's project.json gate
 */
'use strict';

// has DST, differs from the India team's home zone — the default hostile clock
const DEFAULT_HOSTILE = 'America/New_York';
// DST *and* a 45-minute offset — used when home already is the default, so the hostile zone still differs
const ALT_HOSTILE = 'Pacific/Chatham';

/** Pure: a hostile timezone that differs from `homeTz` and has DST. */
function pickHostileTz(homeTz) {
  const home = String(homeTz || '').trim();
  return home === DEFAULT_HOSTILE ? ALT_HOSTILE : DEFAULT_HOSTILE;
}

/** Pure: prefix `TZ=<tz>` to a gate command, idempotently (replaces any leading `TZ=…`). Empty stays empty. */
function withTz(gateCmd, tz) {
  const cmd = String(gateCmd || '').trim();
  if (!cmd) return '';
  return `TZ=${tz} ${cmd.replace(/^TZ=\S+\s+/, '')}`;
}

/** Pure: from a project.json-shaped object, the recommended hostile gate run — {home, tz, command} — or null
 * when no gate is configured. `timezone.home` defaults to Asia/Kolkata (the team's actual home zone). */
function hostileGate(project) {
  const p = project || {};
  if (!p.gate) return null;
  const home = (p.timezone && p.timezone.home) || 'Asia/Kolkata';
  const tz = pickHostileTz(home);
  return { home, tz, command: withTz(p.gate, tz) };
}

module.exports = { pickHostileTz, withTz, hostileGate, DEFAULT_HOSTILE, ALT_HOSTILE };

if (require.main === module) {
  const fs = require('fs'), path = require('path');
  let project = null;
  try { project = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.health-harness', 'project.json'), 'utf8')); } catch { /* none */ }
  const hg = hostileGate(project);
  const arg = process.argv[2];
  if (arg === '--invocation') {
    if (!hg) { process.stderr.write('no gate configured in .health-harness/project.json\n'); process.exit(1); }
    process.stdout.write(hg.command + '\n');
  } else {
    process.stdout.write(JSON.stringify(hg) + '\n');
  }
  process.exit(0);
}

'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { renderStatusline, heat, bar, usageCell, renderUsage, criteriaBadge, rulesBadge, segmentToggles } = require('../bin/statusline.js');
const strip = (s) => String(s).replace(/\x1b\[[0-9;]*m/g, ''); // drop ANSI for content assertions

test('[MBI-138] renderStatusline: dir · ticket · ❓N badge; badge hidden at 0; segments dropped when absent', () => {
  const full = renderStatusline({ dir: 'boundary-test', ticket: 'MBI-129', open: 2 });
  assert.match(full, /boundary-test/);
  assert.match(full, /MBI-129/);
  assert.match(full, /2/);            // the badge count
  assert.match(full, /\?|open/i);     // reads as open-questions

  // nothing open → no badge segment
  const noOpen = renderStatusline({ dir: 'repo', ticket: 'MBI-1', open: 0 });
  assert.match(noOpen, /repo/);
  assert.match(noOpen, /MBI-1/);
  assert.ok(!/open/i.test(noOpen), 'no badge when 0 open');

  // no ticket (e.g. on main) → just the dir, still renders
  assert.equal(renderStatusline({ dir: 'repo', ticket: null, open: 0 }), 'repo');
  // empty input → empty string, never throws
  assert.equal(renderStatusline({}), '');
  assert.equal(renderStatusline(), '');
});

test('[MBI-146] heat/bar/usageCell: pure renderers, heat by how much is spent, bar width fixed', () => {
  assert.equal(heat(10), 32);  // green when plenty left
  assert.equal(heat(70), 33);  // amber ≥60% gone
  assert.equal(heat(90), 31);  // red ≥85% gone
  // bar is w cells wide regardless of pct; more filled as pct climbs
  assert.equal(strip(bar(0)).length, 5);
  assert.equal(strip(bar(100)).length, 5);
  assert.ok((strip(bar(100)).match(/█/g) || []).length > (strip(bar(20)).match(/█/g) || []).length);
  // a cell shows label, a bar, the pct, and an optional reset marker
  const c = strip(usageCell('week', 61, 'Mon 09:00'));
  assert.match(c, /week/); assert.match(c, /61%/); assert.match(c, /Mon 09:00/);
  const noReset = strip(usageCell('ctx', 34));
  assert.match(noReset, /ctx/); assert.match(noReset, /34%/); assert.ok(!/↻/.test(noReset));
});

test('[MBI-146] criteriaBadge: amber ⚠ N criteria unmet when >0, hidden at 0/absent', () => {
  assert.match(strip(criteriaBadge(2)), /⚠\s*2 criteria unmet/);
  assert.equal(criteriaBadge(0), '');
  assert.equal(criteriaBadge(), '');
});

test('[MBI-146] renderUsage: model·cost·ctx·5h·week·session, each dropped when absent', () => {
  const full = strip(renderUsage({
    model: 'Opus 4.8', fast: true, cost: 4.2,
    ctx: 34, fiveH: { pct: 18, reset: '14:30' }, week: { pct: 61, reset: 'Mon 09:00' },
    session: 'mb-work',
  }));
  assert.match(full, /Opus 4\.8/); assert.match(full, /⚡/);
  assert.match(full, /\$4\.20/);
  assert.match(full, /ctx/); assert.match(full, /34%/);
  assert.match(full, /5h/); assert.match(full, /18%/); assert.match(full, /14:30/);
  assert.match(full, /week/); assert.match(full, /61%/);
  assert.match(full, /mb-work/);
  // large cost rounds to whole dollars
  assert.match(strip(renderUsage({ cost: 137.9 })), /\$138\b/);
  // empty usage → empty string
  assert.equal(renderUsage({}), '');
  assert.equal(renderUsage(), '');
});

test('[MBI-146] renderStatusline: ticketless badge + usage half joined after ticket half', () => {
  // ticketless (feature branch, no key) → ⛔ no ticket badge
  assert.match(strip(renderStatusline({ dir: 'repo', ticketless: true })), /⛔\s*no ticket/);
  // ticket present suppresses the ticketless badge even if flag leaks
  const t = strip(renderStatusline({ dir: 'repo', ticket: 'MBI-1', ticketless: true }));
  assert.ok(!/no ticket/.test(t));

  // criteria-unmet badge shows in the ticket half
  assert.match(strip(renderStatusline({ dir: 'repo', ticket: 'MBI-1', unmet: 3 })), /3 criteria unmet/);

  // usage half appended after a separator, both halves present
  const merged = strip(renderStatusline({
    dir: 'repo', ticket: 'MBI-1', open: 1,
    usage: { model: 'Opus 4.8', cost: 1.1, week: { pct: 61, reset: 'Mon 09:00' } },
  }));
  assert.match(merged, /repo/); assert.match(merged, /MBI-1/); assert.match(merged, /open/);
  assert.match(merged, /Opus 4\.8/); assert.match(merged, /week/);
  assert.ok(merged.indexOf('MBI-1') < merged.indexOf('Opus'), 'ticket half precedes usage half');

  // usage only (no dir/ticket) still renders just the usage half
  assert.match(strip(renderStatusline({ usage: { model: 'Opus 4.8' } })), /Opus 4\.8/);
});

test('[MBI-146] rulesBadge: on-track when following harness discipline, off-track otherwise, silent off a work branch', () => {
  // ticketed, no unmet criteria, no open questions → green on-track
  assert.match(strip(rulesBadge({ ticket: 'MBI-1', unmet: 0, open: 0 })), /✓\s*on-track/);
  // any soft/hard slip → off-track (details carried by the specific badges)
  assert.match(strip(rulesBadge({ ticket: 'MBI-1', unmet: 2, open: 0 })), /⚠\s*off-track/);
  assert.match(strip(rulesBadge({ ticket: 'MBI-1', unmet: 0, open: 1 })), /off-track/);
  assert.match(strip(rulesBadge({ ticketless: true })), /off-track/); // no ticket for the work = off-track
  // not a work branch (e.g. main, no ticket, not ticketless) → no rules verdict at all
  assert.equal(rulesBadge({}), '');
  assert.equal(rulesBadge({ ticket: null, ticketless: false }), '');
  // rulesBadge shows in the composed line and precedes the ticket key
  const line = strip(renderStatusline({ dir: 'repo', ticket: 'MBI-1', rules: true, unmet: 0, open: 0 }));
  assert.match(line, /on-track/);
  assert.ok(line.indexOf('on-track') < line.indexOf('MBI-1'), 'verdict precedes the ticket key');
});

test('[MBI-146] segmentToggles: master off kills the line; per-half env toggles; default all on', () => {
  assert.deepEqual(segmentToggles({}), { line: true, ticket: true, usage: true });
  assert.deepEqual(segmentToggles({ HARNESS_STATUSLINE: 'off' }), { line: false, ticket: false, usage: false });
  assert.deepEqual(segmentToggles({ HARNESS_STATUSLINE_USAGE: 'off' }), { line: true, ticket: true, usage: false });
  assert.deepEqual(segmentToggles({ HARNESS_STATUSLINE_TICKET: 'off' }), { line: true, ticket: false, usage: true });
  // case-insensitive
  assert.equal(segmentToggles({ HARNESS_STATUSLINE_USAGE: 'OFF' }).usage, false);
});

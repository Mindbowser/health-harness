'use strict';
// Soft, passive, once-per-session reminder when work (an Edit/Write) starts in a session with no Jira
// ticket linked. Pure decision function — the criteria live here; the hook wiring is thin.
const { test } = require('node:test');
const assert = require('node:assert');
const { evaluate } = require('../bin/ticketless-nudge.js');

const base = { branchKey: '', sessionKeys: [], edited: true, requireTicket: true, alreadyWarned: false };

test('warns when work starts ticketless (edited, no branch key, no session ticket, requireTicket on)', () => {
  const msg = evaluate(base);
  assert.ok(msg && /ticket/i.test(msg), 'returns a one-line reminder mentioning the ticket');
});

test('silent when a ticket is resolvable — branch key OR a ticket referenced this session', () => {
  assert.strictEqual(evaluate({ ...base, branchKey: 'ABC-12' }), null);          // branch carries the key
  assert.strictEqual(evaluate({ ...base, sessionKeys: ['ABC-12'] }), null);      // mentioned in a prompt
});

test('silent on a Q&A-only session — no edit has happened', () => {
  assert.strictEqual(evaluate({ ...base, edited: false }), null);
});

test('once per session — silent after it already warned', () => {
  assert.strictEqual(evaluate({ ...base, alreadyWarned: true }), null);
});

test('opted out — requireTicket:false governs the nudge too (same flag as the commit gate)', () => {
  assert.strictEqual(evaluate({ ...base, requireTicket: false }), null);
});

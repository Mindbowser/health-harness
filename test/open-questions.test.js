'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const {
  emptyLedger, addQuestion, resolveQuestion, openCount, gateDecision,
} = require('../bin/open-questions.js');

// ── pure schema + counting ────────────────────────────────────────────────────
test('[AC-1] addQuestion assigns Q-N ids, defaults status open; the TOOL owns the shape (not the LLM)', () => {
  let led = emptyLedger('COH-1');
  led = addQuestion(led, { ac: 'AC-1', question: 'case-sensitive?', options: ['ci', 'exact'], recommendation: 'ci' });
  led = addQuestion(led, { ac: 'AC-2', question: 'trim whitespace?', recommendation: 'yes' });
  assert.equal(led.issueKey, 'COH-1');
  assert.deepEqual(led.questions.map((q) => q.id), ['Q-1', 'Q-2']);
  const q1 = led.questions[0];
  assert.equal(q1.status, 'open');
  assert.equal(q1.ac, 'AC-1');
  assert.deepEqual(q1.options, ['ci', 'exact']);
  assert.equal(q1.recommendation, 'ci');
  assert.equal(q1.answer, null);
  // missing options normalize to [] — a stable shape regardless of caller
  assert.deepEqual(led.questions[1].options, []);
});

test('[AC-1] resolveQuestion flips status→resolved and records answer + resolvedBy; unknown id is a no-op', () => {
  let led = addQuestion(emptyLedger('COH-1'), { ac: 'AC-1', question: 'q', recommendation: 'r' });
  led = resolveQuestion(led, 'Q-1', { answer: 'exact', resolvedBy: 'dev@x.co' });
  assert.equal(led.questions[0].status, 'resolved');
  assert.equal(led.questions[0].answer, 'exact');
  assert.equal(led.questions[0].resolvedBy, 'dev@x.co');
  // unknown id → unchanged
  const same = resolveQuestion(led, 'Q-9', { answer: 'x' });
  assert.equal(same.questions.length, 1);
});

test('[AC-1] openCount counts only status:open', () => {
  let led = emptyLedger('COH-1');
  led = addQuestion(led, { ac: 'AC-1', question: 'a', recommendation: 'r' });
  led = addQuestion(led, { ac: 'AC-2', question: 'b', recommendation: 'r' });
  assert.equal(openCount(led), 2);
  led = resolveQuestion(led, 'Q-1', { answer: 'x' });
  assert.equal(openCount(led), 1);
});

// ── the deterministic gate ─────────────────────────────────────────────────────
test('[AC-1] gateDecision: any open question → ASK listing them; all resolved / empty / null → null', () => {
  let led = addQuestion(emptyLedger('COH-1'), { ac: 'AC-1', question: 'case-sensitive?', recommendation: 'ci' });
  const d = gateDecision(led);
  assert.equal(d.action, 'ask');
  assert.equal(d.gate, 'openQuestions');
  assert.match(d.reason, /case-sensitive\?/);
  assert.match(d.reason, /AC-1/);
  // resolved → no decision
  assert.equal(gateDecision(resolveQuestion(led, 'Q-1', { answer: 'ci' })), null);
  // empty ledger and null → no decision (opt-in / dormant)
  assert.equal(gateDecision(emptyLedger('COH-1')), null);
  assert.equal(gateDecision(null), null);
});

// ── file round-trip (impure add/resolve via the committed ledger) ──────────────
test('[AC-1] add/resolve persist to .health-harness/open-questions/<KEY>.json and round-trip', () => {
  const oq = require('../bin/open-questions.js');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'oq-'));
  oq.addToFile(root, 'COH-9', { ac: 'AC-1', question: 'timeout?', options: ['30s', '60s'], recommendation: '30s' });
  const p = path.join(root, '.health-harness', 'open-questions', 'COH-9.json');
  assert.ok(fs.existsSync(p));
  assert.equal(oq.readLedger(root, 'COH-9').questions[0].question, 'timeout?');
  oq.resolveInFile(root, 'COH-9', 'Q-1', { answer: '30s', resolvedBy: 'dev@x.co' });
  assert.equal(oq.readLedger(root, 'COH-9').questions[0].status, 'resolved');
});

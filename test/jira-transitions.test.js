'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { inferTransitions } = require('../bin/jira-transitions.js');

test('inferTransitions: maps a standard workflow by name + target status', () => {
  const { transitions, needsConfirm } = inferTransitions([
    { id: 21, name: 'In Progress', to: { name: 'In Progress' } },
    { id: 31, name: 'Ready for QA', to: { name: 'Ready for QA' } },
    { id: 41, name: 'Done', to: { name: 'Done' } },
  ]);
  assert.deepStrictEqual(transitions.onStart, { id: '21', name: 'In Progress' });
  assert.deepStrictEqual(transitions.onShip, { id: '31', name: 'Ready for QA' });
  assert.deepStrictEqual(transitions.onMerge, { id: '41', name: 'Done' });
  assert.strictEqual(needsConfirm, false);             // unique matches all round → no human input needed
});

test('inferTransitions: accepts the API { transitions: [...] } shape and action-named transitions', () => {
  // transition named after the ACTION ("Start Progress") but targeting status "In Progress"
  const { transitions } = inferTransitions({ transitions: [
    { id: '11', name: 'Start Progress', to: { name: 'In Progress' } },
    { id: '19', name: 'Send to Review', to: { name: 'In Review' } },
  ] });
  assert.deepStrictEqual(transitions.onStart, { id: '11', name: 'In Progress' });  // matched via target status
  assert.deepStrictEqual(transitions.onShip, { id: '19', name: 'In Review' });
});

test('inferTransitions: a missing onShip forces a confirm; a missing onMerge does NOT', () => {
  const noShip = inferTransitions([{ id: 21, name: 'In Progress', to: { name: 'In Progress' } }]);
  assert.strictEqual(noShip.transitions.onShip, null);
  assert.strictEqual(noShip.needsConfirm, true);       // onShip is required → ask

  const noMerge = inferTransitions([
    { id: 21, name: 'In Progress', to: { name: 'In Progress' } },
    { id: 31, name: 'In Review', to: { name: 'In Review' } },
  ]);
  assert.strictEqual(noMerge.transitions.onMerge, null);
  assert.strictEqual(noMerge.needsConfirm, false);     // onMerge optional (often unreachable early) → don't nag
});

test('inferTransitions: ambiguous onShip (two review-ish states) flags a confirm', () => {
  const { needsConfirm } = inferTransitions([
    { id: 31, name: 'Code Review', to: { name: 'Code Review' } },
    { id: 32, name: 'Ready for QA', to: { name: 'Ready for QA' } },
  ]);
  assert.strictEqual(needsConfirm, true);              // two matches → don't silently pick; confirm
});

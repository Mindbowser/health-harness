'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { projectOf, relate, isRelated } = require('../bin/issue-graph.js');

test('projectOf: extracts the project prefix', () => {
  assert.strictEqual(projectOf('ABC-123'), 'ABC');
  assert.strictEqual(projectOf('PROJ9-1'), 'PROJ9');
  assert.strictEqual(projectOf('not a key'), '');
});

test('relate: sibling subtasks (same parent) → sibling, related', () => {
  const g = { 'ABC-259': { parent: 'ABC-258' }, 'ABC-260': { parent: 'ABC-258' } };
  const r = relate('ABC-260', ['ABC-259'], g);
  assert.strictEqual(r.tier, 'sibling');
  assert.strictEqual(r.relatedTo, 'ABC-259');
  assert.ok(isRelated(r.tier));
});

test('relate: story ↔ its own subtask → parent-child, related', () => {
  const g = { 'ABC-258': { parent: null }, 'ABC-259': { parent: 'ABC-258' } };
  assert.strictEqual(relate('ABC-259', ['ABC-258'], g).tier, 'parent-child'); // new is child of session key
  assert.strictEqual(relate('ABC-258', ['ABC-259'], g).tier, 'parent-child'); // new is parent of session key
});

test('relate: same epic → epic, related; explicit link → linked, related', () => {
  const epicG = { 'ABC-258': { epic: 'ABC-200' }, 'ABC-261': { epic: 'ABC-200' } };
  assert.strictEqual(relate('ABC-261', ['ABC-258'], epicG).tier, 'epic');
  const linkG = { 'ABC-259': { links: ['ABC-300'] }, 'ABC-300': {} };
  assert.strictEqual(relate('ABC-300', ['ABC-259'], linkG).tier, 'linked'); // session key links to new
  assert.strictEqual(relate('ABC-259', ['ABC-300'], linkG).tier, 'linked'); // new links to session key
});

test('relate: same project but no structural link → same-project (NOT related → falls to size gate)', () => {
  const g = { 'ABC-1': { parent: 'ABC-900' }, 'ABC-2': { parent: 'ABC-901' } }; // different parents
  const r = relate('ABC-2', ['ABC-1'], g);
  assert.strictEqual(r.tier, 'same-project');
  assert.ok(!isRelated(r.tier));
});

test('relate: different project, no link → unrelated', () => {
  const r = relate('XYZ-9', ['ABC-1'], { 'ABC-1': {}, 'XYZ-9': {} });
  assert.strictEqual(r.tier, 'unrelated');
  assert.ok(!isRelated(r.tier));
});

test('relate: strongest relation wins (sibling beats same-project)', () => {
  const g = { 'ABC-1': { parent: 'ABC-900' }, 'ABC-2': { parent: 'ABC-901' }, 'ABC-3': { parent: 'ABC-900' } };
  // ABC-3 shares a parent with ABC-1 (sibling) AND same project as ABC-2 → sibling must win
  assert.strictEqual(relate('ABC-3', ['ABC-2', 'ABC-1'], g).tier, 'sibling');
});

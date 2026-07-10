'use strict';
// MBI-120 [AC-4] — subtaskCoverage: given the story's existing sub-task keys + criteria tagged by sub-task,
// deterministically report which sub-tasks have NO criterion (uncovered) and which criteria map to nothing
// valid (stray) — so /align maps ACs 1:1 onto the existing breakdown instead of inventing a broader set.
const { test } = require('node:test');
const assert = require('node:assert');
const { subtaskCoverage } = require('../bin/subtask-coverage.js');

test('reports uncovered sub-tasks + stray criteria (unknown key or unmapped when sub-tasks exist)', () => {
  const res = subtaskCoverage({
    subtasks: ['MBI-2', 'MBI-3', 'MBI-4'],
    criteria: [
      { subtask: 'MBI-2', text: 'a' },
      { subtask: 'MBI-2', text: 'b' },   // MBI-2 covered
      { subtask: 'MBI-3', text: 'c' },   // MBI-3 covered
      { subtask: '', text: 'no map' },    // stray: no sub-task, but sub-tasks exist
      { subtask: 'MBI-9', text: 'bad' },  // stray: claims a key not on the story
    ],
  });
  assert.deepStrictEqual(res.uncovered, ['MBI-4']);          // MBI-4 has zero criteria
  assert.deepStrictEqual(res.stray.map((s) => s.text), ['no map', 'bad']);
  assert.strictEqual(res.ok, false);
});

test('all criteria mapped 1:1 → ok, nothing uncovered/stray', () => {
  const res = subtaskCoverage({ subtasks: ['MBI-2'], criteria: [{ subtask: 'MBI-2', text: 'x' }] });
  assert.deepStrictEqual(res, { uncovered: [], stray: [], ok: true });
});

test('no sub-tasks (AC-3 unchanged path): story-level criteria are NOT stray', () => {
  const res = subtaskCoverage({ subtasks: [], criteria: [{ subtask: '', text: 'story-level' }] });
  assert.deepStrictEqual(res, { uncovered: [], stray: [], ok: true });
});

test('tolerates missing / invalid input (never throws)', () => {
  assert.deepStrictEqual(subtaskCoverage(), { uncovered: [], stray: [], ok: true });
  assert.deepStrictEqual(subtaskCoverage({}), { uncovered: [], stray: [], ok: true });
  assert.deepStrictEqual(subtaskCoverage({ subtasks: ['MBI-2'], criteria: null }), { uncovered: ['MBI-2'], stray: [], ok: false });
});

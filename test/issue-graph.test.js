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

test('set CLI: captures type/priority and MERGES (a later set without them preserves them)', () => {
  const { execFileSync } = require('node:child_process');
  const os = require('node:os'), fs = require('node:fs'), path = require('node:path');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-graph-'));
  const run = (args) => execFileSync('node', [path.join(__dirname, '..', 'bin', 'issue-graph.js'), 'set', ...args],
    { env: { ...process.env, HOME: home }, encoding: 'utf8' });
  // /align records full facts incl. type/priority
  run(['key=MBI-14', 'parent=MBI-10', 'epic=MBI-1', 'type=Story', 'priority=P2']);
  // a later /tdd records only hierarchy — must NOT wipe type/priority
  run(['key=MBI-14', 'parent=MBI-10', 'epic=MBI-1']);
  const g = JSON.parse(fs.readFileSync(path.join(home, '.health-harness', 'issue-graph.json'), 'utf8'));
  assert.strictEqual(g['MBI-14'].type, 'Story', 'type preserved across a set that omitted it');
  assert.strictEqual(g['MBI-14'].priority, 'P2', 'priority preserved across a set that omitted it');
  assert.strictEqual(g['MBI-14'].epic, 'MBI-1');
  // explicitly clearing a field (passing empty) sets it null
  run(['key=MBI-14', 'priority=']);
  const g2 = JSON.parse(fs.readFileSync(path.join(home, '.health-harness', 'issue-graph.json'), 'utf8'));
  assert.strictEqual(g2['MBI-14'].priority, null, 'an explicit empty value clears the field');
  assert.strictEqual(g2['MBI-14'].type, 'Story', 'unrelated fields still preserved');
  fs.rmSync(home, { recursive: true, force: true });
});

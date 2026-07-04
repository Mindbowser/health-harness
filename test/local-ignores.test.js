'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), os = require('os'), path = require('path');
const { LOCAL_IGNORES, missingIgnoreLines, ensureLocalIgnores } = require('../bin/local-ignores.js');

test('LOCAL_IGNORES covers align/prd working notes but NOT the committed criteria manifest', () => {
  assert.ok(LOCAL_IGNORES.includes('.health-harness/sprints/'));   // align.md / prd.md working notes → local
  assert.ok(LOCAL_IGNORES.some((l) => /local\//.test(l)));         // a general dev-local scratch dir
  // the criteria MANIFEST is committed by design (the wall + teammates read it) — never ignored
  assert.ok(!LOCAL_IGNORES.some((l) => /criteria\/?$/.test(l) && !/local/.test(l)));
});

test('missingIgnoreLines: returns only the required patterns absent from the current .gitignore', () => {
  assert.deepStrictEqual(missingIgnoreLines(''), LOCAL_IGNORES);            // empty → all missing
  const withSprints = '.health-harness/sprints/\nnode_modules/\n';
  const missing = missingIgnoreLines(withSprints);
  assert.ok(!missing.includes('.health-harness/sprints/'));                 // already present → not re-added
  assert.ok(missing.includes('.health-harness/local/'));                    // still missing
});

test('missingIgnoreLines: matching ignores surrounding whitespace / trailing slash noise', () => {
  const gi = '  .health-harness/sprints/  \n';
  assert.ok(!missingIgnoreLines(gi).includes('.health-harness/sprints/'));  // whitespace-tolerant
});

test('ensureLocalIgnores: appends missing patterns idempotently, creating .gitignore if absent', () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-ign-'));
  const first = ensureLocalIgnores(cwd);
  assert.deepStrictEqual(first.added, LOCAL_IGNORES);                       // fresh repo → all added
  const gi = fs.readFileSync(path.join(cwd, '.gitignore'), 'utf8');
  for (const l of LOCAL_IGNORES) assert.ok(gi.includes(l));
  const second = ensureLocalIgnores(cwd);
  assert.deepStrictEqual(second.added, []);                                 // idempotent — nothing to add
});

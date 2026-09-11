'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const pc = require('../bin/precommit-checks.js');
const { addedLines } = require('../bin/diff-summary.js');

const MARKER = '<'.repeat(7); // built at runtime so this test file isn't itself a conflict-marker hit
const diffWith = (line) => ['+++ b/src/x.js', '@@ -1,1 +1,2 @@', ' const ctx = 1;', '+' + line].join('\n');

test('[AC-1] merge-conflict marker on an added line is reported', () => {
  const f = pc.checkMergeMarkers(addedLines(diffWith(MARKER + ' HEAD')));
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].check, 'mergeConflictMarkers');
  assert.strictEqual(f[0].file, 'src/x.js');
  assert.strictEqual(f[0].line, 2);
});

test('[AC-2] focused tests (.only / fdescribe / fit) are reported', () => {
  assert.strictEqual(pc.checkFocusedTests(addedLines(diffWith('it.only("x", () => {});'))).length, 1);
  assert.strictEqual(pc.checkFocusedTests(addedLines(diffWith('describe.only("x", () => {});'))).length, 1);
  assert.strictEqual(pc.checkFocusedTests(addedLines(diffWith('fdescribe("x", () => {});'))).length, 1);
  assert.strictEqual(pc.checkFocusedTests(addedLines(diffWith('fit("x", () => {});'))).length, 1);
  // a normal test is fine
  assert.deepStrictEqual(pc.checkFocusedTests(addedLines(diffWith('it("x", () => {});'))), []);
});

test('[AC-3] a staged file over the size limit is reported', () => {
  const f = pc.checkLargeFiles([{ path: 'assets/big.bin', bytes: 9 * 1048576 }, { path: 'src/x.js', bytes: 900 }]);
  assert.strictEqual(f.length, 1);
  assert.strictEqual(f[0].file, 'assets/big.bin');
  assert.match(f[0].message, /9\.0 MB/);
});

test('[AC-5] a pattern on a CONTEXT (unchanged) line is never reported', () => {
  const contextOnly = ['+++ b/src/x.js', '@@ -1,2 +1,2 @@', ' it.only("pre-existing", () => {});', '+const b = 2;'].join('\n');
  assert.deepStrictEqual(pc.checkFocusedTests(addedLines(contextOnly)), []);
});

test('[AC-4/AC-6] defaults are quiet: debug + filler are OFF until enabled; clean input yields nothing', () => {
  const added = addedLines(diffWith('console.log("hi"); debugger;'));
  const subject = 'feat(x): seamless robust experience';
  // defaults → neither debugLeftover nor plainEnglishCommit fires
  assert.deepStrictEqual(pc.runChecks({ addedLines: added, subject, config: {} }), []);
  // enabled → both fire
  const on = pc.runChecks({ addedLines: added, subject, config: { 'hooks.debugLeftover': true, 'hooks.plainEnglishCommit': true } });
  assert.ok(on.some((f) => f.check === 'debugLeftover'));
  const jazz = on.find((f) => f.check === 'plainEnglishCommit');
  assert.ok(jazz && /seamless/.test(jazz.message) && /robust/.test(jazz.message));
  // [AC-6] clean input → no findings at all
  assert.deepStrictEqual(pc.runChecks({ addedLines: addedLines(diffWith('const ok = 1;')), subject: 'fix(api): handle empty payload', config: {} }), []);
});

test('plain-English check passes a plain subject and flags only whole words', () => {
  assert.deepStrictEqual(pc.checkPlainEnglish('fix(db): retry on lock timeout'), []);
  assert.deepStrictEqual(pc.checkPlainEnglish('feat: add robustness metrics'), []); // "robustness" != "robust"
  assert.strictEqual(pc.checkPlainEnglish('feat: robust retry').length, 1);
});

test('formatFindings renders a short readable block with file:line', () => {
  const out = pc.formatFindings(pc.checkMergeMarkers(addedLines(diffWith(MARKER + ' HEAD'))));
  assert.match(out, /mergeConflictMarkers/);
  assert.match(out, /src\/x\.js:2/);
});

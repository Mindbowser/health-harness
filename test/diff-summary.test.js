'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const ds = require('../bin/diff-summary.js');

const NUMSTAT = [
  '10\t2\tsrc/app.js',
  '120\t0\tsrc/big.js',
  '0\t45\tsrc/gone.js',
  '-\t-\tassets/logo.png', // binary → dashes
].join('\n');

test('parseNumstat: turns git numstat into {file, added, removed}; binary counts as 0', () => {
  const e = ds.parseNumstat(NUMSTAT);
  assert.deepStrictEqual(e[0], { file: 'src/app.js', added: 10, removed: 2, binary: false });
  assert.deepStrictEqual(e[1], { file: 'src/big.js', added: 120, removed: 0, binary: false });
  assert.deepStrictEqual(e[3], { file: 'assets/logo.png', added: 0, removed: 0, binary: true });
  assert.strictEqual(e.length, 4);
  // empty / junk input never throws
  assert.deepStrictEqual(ds.parseNumstat(''), []);
  assert.deepStrictEqual(ds.parseNumstat(null), []);
});

test('summarize: totals across files', () => {
  const s = ds.summarize(ds.parseNumstat(NUMSTAT));
  assert.strictEqual(s.files, 4);
  assert.strictEqual(s.added, 130);
  assert.strictEqual(s.removed, 47);
});

test('[AC-6] formatSummary lists the largest changes first and truncates rather than dumping everything', () => {
  const many = Array.from({ length: 30 }, (_, i) => `${i + 1}\t0\tfile${i}.js`).join('\n');
  const out = ds.formatSummary(ds.parseNumstat(many), { max: 5 });
  const lines = out.split('\n').filter((l) => l.includes('.js'));
  assert.strictEqual(lines.length, 5, 'only the top 5 files are listed');
  assert.match(out, /file29\.js/, 'largest change is listed first');
  assert.match(out, /25 more/, 'the remainder is summarized, not dumped');
  // totals are always present
  assert.match(out, /30 files/);
});

test('[AC-2] isNonInteractive: true under any standard CI marker, false for a normal shell', () => {
  assert.strictEqual(ds.isNonInteractive({ CI: 'true' }), true);
  assert.strictEqual(ds.isNonInteractive({ GITHUB_ACTIONS: 'true' }), true);
  assert.strictEqual(ds.isNonInteractive({ GITLAB_CI: 'true' }), true);
  assert.strictEqual(ds.isNonInteractive({ JENKINS_URL: 'http://x' }), true);
  assert.strictEqual(ds.isNonInteractive({ BUILDKITE: 'true' }), true);
  assert.strictEqual(ds.isNonInteractive({ CIRCLECI: 'true' }), true);
  assert.strictEqual(ds.isNonInteractive({ PATH: '/usr/bin' }), false);
  assert.strictEqual(ds.isNonInteractive({}), false);
  assert.strictEqual(ds.isNonInteractive({ CI: 'false' }), false); // explicitly disabled CI var
});

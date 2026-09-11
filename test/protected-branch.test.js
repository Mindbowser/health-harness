'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const pb = require('../bin/protected-branch.js');

test('[AC-1] exact names and globs match; unrelated branches do not', () => {
  const patterns = ['main', 'master', 'release/*'];
  assert.strictEqual(pb.isProtected('main', patterns), true);
  assert.strictEqual(pb.isProtected('release/1.2', patterns), true);
  assert.strictEqual(pb.isProtected('feature/x', patterns), false);
  // a glob is single-segment by default: release/* should not swallow a nested path
  assert.strictEqual(pb.isProtected('release/1.2/hotfix', patterns), false);
});

test('[AC-2] backward compatible: project.json baseBranch is included even if not a default', () => {
  const set = pb.resolveProtected({
    config: { protectedBranches: ['main', 'master', 'prod', 'production', 'release/*'] },
    project: { git: { baseBranch: 'develop', prTarget: 'develop' } },
  });
  assert.ok(set.includes('develop'), 'develop (the repo base) must be protected');
  assert.strictEqual(pb.isProtected('develop', set), true);
});

test('[AC-3] dev-added names extend the defaults with no duplicates', () => {
  const set = pb.resolveProtected({
    config: { protectedBranches: ['main', 'master', 'dev', 'qa', 'stage', 'uat', 'main'] },
    project: { git: { baseBranch: 'main' } },
  });
  for (const b of ['main', 'master', 'dev', 'qa', 'stage', 'uat']) assert.strictEqual(pb.isProtected(b, set), true);
  // main appears once despite being listed twice and also the baseBranch
  assert.strictEqual(set.filter((p) => p === 'main').length, 1);
});

test('[AC-4] matching is case-sensitive (git branch names are)', () => {
  assert.strictEqual(pb.isProtected('Main', ['main']), false);
  assert.strictEqual(pb.isProtected('MAIN', ['main']), false);
  assert.strictEqual(pb.isProtected('main', ['main']), true);
});

test('empty/edge inputs never throw and never over-protect', () => {
  assert.strictEqual(pb.isProtected('', ['main']), false);
  assert.strictEqual(pb.isProtected('main', []), false);
  assert.strictEqual(pb.isProtected('main', null), false);
  assert.deepStrictEqual(pb.resolveProtected({}), pb.resolveProtected({ config: {}, project: {} }));
});

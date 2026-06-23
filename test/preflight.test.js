'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { assess, renderPreflight } = require('../bin/preflight.js');

test('assess: a fully-set-up repo is all-green', () => {
  const checks = assess({
    inRepo: true, email: 'dev@mindbowser.com', hasRemote: true, branch: 'feature/x',
    gh: { installed: true, authed: true }, gate: { hasTestScript: true, isStub: false },
    compliance: true, jiraCoords: true, role: 'engineer', db: { present: true, hasMigrationLayer: true },
  });
  assert.ok(checks.every((c) => c.status === 'ok'), 'all checks should pass');
});

test('assess: gh missing → warn (with install hint); installed-but-unauthed → warn (gh auth login); absent fact → no check', () => {
  const base = { inRepo: true, email: 'dev@mindbowser.com', hasRemote: true, branch: 'feat/x', gate: { hasTestScript: true, isStub: false }, compliance: true, jiraCoords: true, role: 'engineer' };
  const missing = Object.fromEntries(assess({ ...base, gh: { installed: false, installHint: 'brew install gh' } }).map((c) => [c.key, c]));
  assert.strictEqual(missing.gh.status, 'warn');
  assert.ok(missing.gh.fix.includes('brew install gh'));   // surfaces the OS-specific install command
  const unauthed = Object.fromEntries(assess({ ...base, gh: { installed: true, authed: false } }).map((c) => [c.key, c]));
  assert.strictEqual(unauthed.gh.status, 'warn');
  assert.ok(unauthed.gh.fix.includes('gh auth login'));    // the auth step, not a reinstall
  const ok = Object.fromEntries(assess({ ...base, gh: { installed: true, authed: true } }).map((c) => [c.key, c]));
  assert.strictEqual(ok.gh.status, 'ok');
  const absent = Object.fromEntries(assess(base).map((c) => [c.key, c]));
  assert.ok(!('gh' in absent));                            // no gh fact → no check (back-compat)
});

test('assess: flags the silent-failure cases new users hit', () => {
  const checks = assess({
    inRepo: true, email: null, hasRemote: false, branch: 'main',
    gate: { hasTestScript: false, isStub: false }, compliance: false, jiraCoords: false,
  });
  const by = Object.fromEntries(checks.map((c) => [c.key, c]));
  assert.strictEqual(by.git_email.status, 'fail');        // no email → metrics + commits mis-attributed
  assert.ok(by.git_email.fix.includes('git config'));     // gives the fix command
  assert.strictEqual(by.git_remote.status, 'warn');       // no remote → push will fail later
  assert.strictEqual(by.gate.status, 'fail');             // no gate → no AFK build
  assert.strictEqual(by.compliance.status, 'warn');       // not onboarded yet
  assert.strictEqual(by.branch.status, 'warn');           // on base branch
});

test('assess: a personal email is flagged (warn), a stub gate is flagged (fail)', () => {
  const checks = assess({
    inRepo: true, email: 'someone@gmail.com', hasRemote: true, branch: 'feat/y',
    gate: { hasTestScript: true, isStub: true }, compliance: true, jiraCoords: true,
  });
  const by = Object.fromEntries(checks.map((c) => [c.key, c]));
  assert.strictEqual(by.git_email.status, 'warn');        // looks personal, not company
  assert.strictEqual(by.gate.status, 'fail');             // stub "no test specified" ≠ a real gate
});

test('assess: role unset → warn; set → ok', () => {
  const base = { inRepo: true, email: 'dev@mindbowser.com', hasRemote: true, branch: 'feat/x', gate: { hasTestScript: true, isStub: false }, compliance: true, jiraCoords: true };
  const unset = Object.fromEntries(assess({ ...base, role: null }).map((c) => [c.key, c]));
  assert.strictEqual(unset.role.status, 'warn');
  assert.ok(unset.role.fix.includes('/role'));
  const set = Object.fromEntries(assess({ ...base, role: 'engineer' }).map((c) => [c.key, c]));
  assert.strictEqual(set.role.status, 'ok');
});

test('assess: DB present without a migration layer → warn; with → ok; no DB → no check', () => {
  const base = { inRepo: true, email: 'dev@mindbowser.com', hasRemote: true, branch: 'feat/x', gate: { hasTestScript: true, isStub: false }, compliance: true, jiraCoords: true, role: 'engineer' };
  const gap = Object.fromEntries(assess({ ...base, db: { present: true, hasMigrationLayer: false } }).map((c) => [c.key, c]));
  assert.strictEqual(gap.migrations.status, 'warn');
  const ok = Object.fromEntries(assess({ ...base, db: { present: true, hasMigrationLayer: true } }).map((c) => [c.key, c]));
  assert.strictEqual(ok.migrations.status, 'ok');
  const none = Object.fromEntries(assess({ ...base, db: { present: false } }).map((c) => [c.key, c]));
  assert.ok(!('migrations' in none)); // no DB → silent, no migration check at all
});

test('renderPreflight shows status glyphs and only surfaces fixes for non-ok checks', () => {
  const out = renderPreflight([
    { key: 'git_email', status: 'fail', label: 'Git identity', detail: 'unset', fix: "git config user.email you@mindbowser.com" },
    { key: 'git_remote', status: 'ok', label: 'Git remote', detail: 'origin set', fix: '' },
  ]);
  assert.match(out, /Git identity/);
  assert.match(out, /git config user\.email/); // the fix for the failing one
  assert.match(out, /✅|☑/); // an ok glyph for the passing one
});

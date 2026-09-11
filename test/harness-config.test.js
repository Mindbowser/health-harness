'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const cfg = require('../bin/harness-config.js');

function tmp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hcfg-'));
  return { repoDir: root, homeDir: fs.mkdtempSync(path.join(os.tmpdir(), 'hcfg-home-')) };
}
const repoFile = (d) => path.join(d.repoDir, '.health-harness', 'settings.json');
const userFile = (d) => path.join(d.homeDir, '.health-harness', 'settings.json');
const readJSON = (p) => JSON.parse(fs.readFileSync(p, 'utf8'));

test('[AC-1] no files → every setting resolves to its default, marked locked/configurable with source', () => {
  const d = tmp();
  const eff = cfg.effective(d);
  // a known configurable + a known locked key are present
  assert.strictEqual(eff['branchNaming'].tier, 'configurable');
  assert.strictEqual(eff['branchNaming'].source, 'default');
  assert.strictEqual(eff['branchNaming'].value, cfg.SCHEMA['branchNaming'].default);
  assert.strictEqual(eff['secretScanning'].tier, 'locked');
  assert.strictEqual(eff['secretScanning'].source, 'locked');
  assert.strictEqual(eff['secretScanning'].value, true);
  // sound is on by default (chosen: default ON, offer to mute)
  assert.strictEqual(eff['sound.enabled'].value, true);
  // every schema key is represented
  assert.deepStrictEqual(Object.keys(eff).sort(), Object.keys(cfg.SCHEMA).sort());
});

test('[AC-2] set a configurable key → saved to the correct layer file (repo vs user)', () => {
  const d = tmp();
  const r = cfg.set(d, 'branchNaming', 'fix/<KEY>-<slug>'); // repo-layer
  assert.strictEqual(r.ok, true);
  assert.strictEqual(readJSON(repoFile(d))['branchNaming'], 'fix/<KEY>-<slug>');
  assert.ok(!fs.existsSync(userFile(d)), 'repo-layer set must not write the user file');

  const u = cfg.set(d, 'sound.enabled', false); // user-layer
  assert.strictEqual(u.ok, true);
  assert.strictEqual(readJSON(userFile(d))['sound.enabled'], false);
  assert.strictEqual(cfg.effective(d)['sound.enabled'].value, false);
  assert.strictEqual(cfg.effective(d)['sound.enabled'].source, 'user');
});

test('[AC-3] set a locked key → refused with a clear message; enforced value unchanged', () => {
  const d = tmp();
  const r = cfg.set(d, 'secretScanning', false);
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /locked/i);
  assert.ok(!fs.existsSync(repoFile(d)), 'a refused locked set must not create/modify a file');
  assert.strictEqual(cfg.effective(d)['secretScanning'].value, true);
});

test('[AC-3b] unknown key → refused, not silently written', () => {
  const d = tmp();
  const r = cfg.set(d, 'nope.notReal', 'x');
  assert.strictEqual(r.ok, false);
  assert.match(r.error, /unknown/i);
});

test('[AC-4] both files present → repo-layer from repo file, user-layer from user file, source reported', () => {
  const d = tmp();
  fs.mkdirSync(path.dirname(repoFile(d)), { recursive: true });
  fs.mkdirSync(path.dirname(userFile(d)), { recursive: true });
  fs.writeFileSync(repoFile(d), JSON.stringify({ branchNaming: 'wip/<slug>' }));
  fs.writeFileSync(userFile(d), JSON.stringify({ 'sound.enabled': false }));
  const eff = cfg.effective(d);
  assert.strictEqual(eff['branchNaming'].value, 'wip/<slug>');
  assert.strictEqual(eff['branchNaming'].source, 'repo');
  assert.strictEqual(eff['sound.enabled'].value, false);
  assert.strictEqual(eff['sound.enabled'].source, 'user');
  // a repo-layer key placed only in the user file is ignored (wrong layer)
  fs.writeFileSync(userFile(d), JSON.stringify({ 'sound.enabled': false, branchNaming: 'ignored' }));
  assert.strictEqual(cfg.effective(d)['branchNaming'].value, 'wip/<slug>');
});

test('[AC-5] set preserves unrelated keys in the same layer file (no clobber)', () => {
  const d = tmp();
  fs.mkdirSync(path.dirname(repoFile(d)), { recursive: true });
  fs.writeFileSync(repoFile(d), JSON.stringify({ branchNaming: 'a/<slug>', someOtherKey: 'keep-me' }));
  cfg.set(d, 'protectedBranches', ['main', 'dev']);
  const after = readJSON(repoFile(d));
  assert.strictEqual(after['someOtherKey'], 'keep-me');
  assert.deepStrictEqual(after['protectedBranches'], ['main', 'dev']);
  assert.strictEqual(after['branchNaming'], 'a/<slug>');
});

test('coerce: CLI string values become the schema type', () => {
  assert.strictEqual(cfg.coerce('boolean', 'false'), false);
  assert.strictEqual(cfg.coerce('boolean', 'true'), true);
  assert.deepStrictEqual(cfg.coerce('list', 'main,dev, qa'), ['main', 'dev', 'qa']);
  assert.strictEqual(cfg.coerce('string', 'feature/x'), 'feature/x');
});

#!/usr/bin/env node
/**
 * release.js — one-command release for the harness repo. Pushing to main ALWAYS releases (see CLAUDE.md),
 * so this enforces the steps: verify on main + clean tree + the three manifests agree on the version, run
 * the gate, push main, then create+push the tag `health-harness--v<version>`. Idempotent on the tag.
 *
 * Usage: npm run release   (run AFTER you've committed the version bump). It does NOT bump the version —
 * the version lives in plugin.json/marketplace.json/package.json and is bumped as part of the feature change.
 */
'use strict';
const { execSync } = require('child_process');
const run = (c) => execSync(c, { stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8' }).trim();
const root = require('path').join(__dirname, '..');
const { versions, agree } = require('./version-check.js');

function fail(msg) { console.error(`✗ release: ${msg}`); process.exit(1); }

const branch = run('git rev-parse --abbrev-ref HEAD');
if (branch !== 'main') fail(`not on main (on '${branch}')`);
if (run('git status --porcelain')) fail('working tree is dirty — commit first');

const vv = versions(root);
const v = vv.plugin;
if (!agree(vv)) fail(`version mismatch — plugin=${vv.plugin} marketplace=${vv.marketplace} package=${vv.package}; bump all three`);

const tag = `health-harness--v${v}`;
if (run('git tag -l ' + tag)) fail(`tag ${tag} already exists — bump the version before releasing`);

console.log(`→ gate (npm test)`); execSync('npm test', { cwd: root, stdio: 'inherit' });
console.log(`→ push main`); execSync('git push origin main', { cwd: root, stdio: 'inherit' });
console.log(`→ tag ${tag}`);
execSync(`git tag -a "${tag}" -m "release: v${v}"`, { cwd: root, stdio: 'inherit' });
execSync(`git push origin "${tag}"`, { cwd: root, stdio: 'inherit' });
console.log(`✓ released ${tag}`);

#!/usr/bin/env node
'use strict';
/**
 * version-check — single source of truth for "the three manifests agree on the version".
 *
 * The harness version lives in three places that MUST stay in lockstep (CLAUDE.md release gate):
 *   .claude-plugin/plugin.json, .claude-plugin/marketplace.json (nested under plugins[0]), package.json.
 * `release.js` uses this to gate a release; the test suite uses it to catch a partial bump.
 *
 * Usage: node bin/version-check.js   → prints the three versions; exits 0 if they agree, 1 if not.
 */
const fs = require('fs');
const path = require('path');

const REPO_ROOT = path.join(__dirname, '..');

/** Read the version from each of the three manifests. Returns { plugin, marketplace, package }. */
function versions(root = REPO_ROOT) {
  const load = (p) => JSON.parse(fs.readFileSync(path.join(root, p), 'utf8'));
  const mkt = load('.claude-plugin/marketplace.json');
  return {
    plugin: load('.claude-plugin/plugin.json').version,
    marketplace: mkt.plugins && mkt.plugins[0] && mkt.plugins[0].version, // marketplace version is nested
    package: load('package.json').version,
  };
}

/** True only when all three versions are defined and identical. */
function agree(v = versions()) {
  return Boolean(v.plugin) && v.plugin === v.marketplace && v.plugin === v.package;
}

module.exports = { versions, agree, REPO_ROOT };

if (require.main === module) {
  const v = versions();
  if (agree(v)) {
    process.stdout.write(`✓ versions agree: ${v.plugin}\n`);
    process.exit(0);
  }
  process.stderr.write(`✗ version mismatch — plugin=${v.plugin} marketplace=${v.marketplace} package=${v.package}; bump all three\n`);
  process.exit(1);
}

'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { versions, agree } = require('../bin/version-check.js');

test('agree: true only when all three manifests match', () => {
  assert.strictEqual(agree({ plugin: '1.2.3', marketplace: '1.2.3', package: '1.2.3' }), true);
  assert.strictEqual(agree({ plugin: '1.2.3', marketplace: '1.2.4', package: '1.2.3' }), false);
  assert.strictEqual(agree({ plugin: '1.2.3', marketplace: '1.2.3', package: '9.9.9' }), false);
  assert.strictEqual(agree({ plugin: undefined, marketplace: undefined, package: undefined }), false);
});

test('versions: reads the three real manifests and they agree (criterion 7 guard)', () => {
  const v = versions();
  assert.match(v.plugin, /^\d+\.\d+\.\d+$/, 'plugin.json has a semver version');
  assert.strictEqual(v.plugin, v.marketplace, 'plugin.json and marketplace.json agree');
  assert.strictEqual(v.plugin, v.package, 'plugin.json and package.json agree');
  assert.ok(agree(v), 'all three manifests agree — a partial version bump fails this');
});

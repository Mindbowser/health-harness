'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { grantActive, grantPath, DEFAULT_TTL_MS } = require('../bin/ship-grant.js');

test('grantActive: valid within TTL, expired after, false on missing/garbage', () => {
  const now = 1_000_000;
  assert.strictEqual(grantActive({ ts: now - 1000 }, now, DEFAULT_TTL_MS), true);       // 1s ago → active
  assert.strictEqual(grantActive({ ts: now - (DEFAULT_TTL_MS + 1) }, now, DEFAULT_TTL_MS), false); // expired
  assert.strictEqual(grantActive(null, now, DEFAULT_TTL_MS), false);
  assert.strictEqual(grantActive({}, now, DEFAULT_TTL_MS), false);                       // no ts
});

test('grantPath: stable per cwd, distinct across repos', () => {
  assert.strictEqual(grantPath('/a/repo'), grantPath('/a/repo'));
  assert.notStrictEqual(grantPath('/a/repo'), grantPath('/b/repo'));
});

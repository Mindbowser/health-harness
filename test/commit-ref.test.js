'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { hasReference, suggestReference, REF_FORMATS } = require('../bin/commit-ref.js');

test('hasReference: anywhere (default) accepts a key in any position', () => {
  assert.strictEqual(hasReference('feat: add thing ABC-12', 'anywhere'), true);
  assert.strictEqual(hasReference('feat: add thing', 'anywhere'), false);
});

test('hasReference: footer requires a "Refs KEY-N" line on its own', () => {
  assert.strictEqual(hasReference('feat: add thing\n\nRefs ABC-12', 'footer'), true);
  assert.strictEqual(hasReference('feat: add thing ABC-12', 'footer'), false);   // key in subject ≠ footer
  assert.strictEqual(hasReference('feat: add thing\n\nrefs abc-12', 'footer'), true); // case-insensitive
});

test('hasReference: scope requires the key inside the conventional scope', () => {
  assert.strictEqual(hasReference('feat(ABC-12): add thing', 'scope'), true);
  assert.strictEqual(hasReference('feat(api): add thing', 'scope'), false);
  assert.strictEqual(hasReference('fix(ABC-9)!: breaking', 'scope'), true);
});

test('hasReference: trailing requires "(KEY-N)" at the end of the subject', () => {
  assert.strictEqual(hasReference('feat(api): add thing (ABC-12)', 'trailing'), true);
  assert.strictEqual(hasReference('feat(api): add thing', 'trailing'), false);
});

test('suggestReference: fills the key into the configured carrier', () => {
  assert.strictEqual(suggestReference('ABC-12', 'footer'), 'Refs ABC-12');
  assert.ok(suggestReference('ABC-12', 'scope').includes('(ABC-12)'));
  assert.ok(suggestReference('ABC-12', 'trailing').includes('(ABC-12)'));
  assert.ok(suggestReference('ABC-12', 'anywhere').includes('ABC-12'));
});

test('REF_FORMATS lists the supported carriers', () => {
  assert.deepStrictEqual([...REF_FORMATS].sort(), ['anywhere', 'footer', 'scope', 'trailing']);
});

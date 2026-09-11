'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { addAllowEntry } = require('../bin/harness-allowlist.js');
const rs = require('../bin/redaction-scan.js');

const SECRET = 'AKIA' + 'IOSFODNN7EXAMPLE';

test('[AC-4] add without a reason is refused (allow-listing is audited)', () => {
  assert.strictEqual(addAllowEntry([], SECRET, '').ok, false);
  assert.strictEqual(addAllowEntry([], SECRET, '   ').ok, false);
  assert.strictEqual(addAllowEntry([], '', 'why').ok, false);
  assert.match(addAllowEntry([], SECRET, '').error, /reason/i);
});

test('[AC-3] add with a reason yields an audit record (value, reason, by, at), deduped by value', () => {
  const r = addAllowEntry([], SECRET, 'canonical example key', { by: 'dev@x', at: '2026-09-11T00:00:00Z' });
  assert.strictEqual(r.ok, true);
  assert.deepStrictEqual(r.allow[0], { value: SECRET, reason: 'canonical example key', by: 'dev@x', at: '2026-09-11T00:00:00Z' });
  // re-adding the same value updates rather than duplicating
  const r2 = addAllowEntry(r.allow, SECRET, 'still fine', { by: 'dev@x', at: '2026-09-12T00:00:00Z' });
  assert.strictEqual(r2.allow.length, 1);
  assert.strictEqual(r2.allow[0].reason, 'still fine');
});

test('[AC-3] merge-not-clobber: an existing string allow entry is preserved alongside the new record', () => {
  const r = addAllowEntry(['pre-existing@example.com'], SECRET, 'x', { by: 'd', at: 't' });
  assert.strictEqual(r.allow.length, 2);
  assert.ok(r.allow.includes('pre-existing@example.com'));
});

test('[AC-3] end-to-end: after the allow entry, the scanner skips that secret', () => {
  const r = addAllowEntry([], SECRET, 'example key in docs', { by: 'd', at: 't' });
  const values = r.allow.map((a) => (typeof a === 'string' ? a : a.value));
  const line = 'const key = "' + SECRET + '";';
  assert.strictEqual(rs.scanText(line, { classes: ['secrets'] }).length, 1);          // before
  assert.strictEqual(rs.scanText(line, { classes: ['secrets'], allow: values }).length, 0); // after
});

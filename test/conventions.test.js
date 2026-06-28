'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { read, write, gaps } = require('../bin/conventions.js');

function tmp() { return fs.mkdtempSync(path.join(os.tmpdir(), 'conv-')); }

test('conventions read/write: round-trips a committed conventions.json; missing → {}', () => {
  const dir = tmp();
  assert.deepStrictEqual(read(dir), {}); // none yet
  const conv = { logging: { module: 'src/lib/logger', rotating: true }, audit: { helper: 'src/lib/audit.record' }, datetime: { policy: 'store-utc' } };
  const p = write(dir, conv);
  assert.ok(p.endsWith(path.join('.health-harness', 'conventions.json')));
  assert.deepStrictEqual(read(dir), conv);
});

test('conventions gaps: reports which required setup is missing (for the onboarding ask)', () => {
  // nothing recorded → all required keys are gaps
  assert.deepStrictEqual(gaps({}).sort(), ['audit', 'datetime', 'lint', 'logging', 'typecheck']);
  // a partial record → only the absent ones are gaps
  assert.deepStrictEqual(gaps({ logging: { module: 'x' }, lint: true, typecheck: true }).sort(), ['audit', 'datetime']);
  // fully recorded → no gaps
  assert.deepStrictEqual(gaps({ logging: { module: 'x' }, audit: { helper: 'y' }, datetime: { policy: 'store-utc' }, lint: true, typecheck: true }), []);
});

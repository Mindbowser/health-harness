'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { concernsFor, CONCERNS, concernKeys } = require('../bin/concerns.js');

const keys = (text, opts) => concernsFor(text, opts).map((c) => c.key);

test('timezone: a time/date/scheduling feature surfaces the timezone concern with a test requirement', () => {
  const cs = concernsFor('Show the next appointment time and let users reschedule across timezones', {});
  const tz = cs.find((c) => c.key === 'timezone');
  assert.ok(tz, 'timezone concern should fire');
  assert.strictEqual(tz.needsTest, true);
  assert.match(tz.prompt, /timezone|DST|offset/i);
});

test('audit + safe-logging: PHI access on a hipaa repo surfaces both; a none profile suppresses them', () => {
  assert.ok(keys('View a patient medical record', { profile: 'hipaa' }).includes('audit'));
  assert.ok(keys('View a patient medical record', { profile: 'hipaa' }).includes('safe-logging'));
  assert.ok(!keys('View a patient medical record', { profile: 'none' }).includes('audit'));
});

test('scale: a list/pagination feature surfaces the scale concern (the pagination-class bug)', () => {
  assert.ok(keys('Paginated list of search results', {}).includes('scale'));
  assert.ok(keys('Render a table of all appointments', {}).includes('scale'));
});

test('error-handling: a failure/exception-facing feature surfaces the error-handling concern', () => {
  assert.ok(keys('Handle a failed payment and show the user a message', {}).includes('error-handling'));
});

test('a trivial cosmetic change surfaces no cross-cutting concerns', () => {
  assert.deepStrictEqual(concernsFor('Change the button label from Save to Submit', {}), []);
});

test('registry is extensible + well-formed: every concern has key/label/prompt/needsTest, keys are unique', () => {
  assert.ok(CONCERNS.length >= 4);
  const seen = new Set();
  for (const c of CONCERNS) {
    assert.ok(c.key && c.label && c.prompt, `concern ${c.key} well-formed`);
    assert.strictEqual(typeof c.needsTest, 'boolean');
    assert.ok(!seen.has(c.key), `duplicate key ${c.key}`);
    seen.add(c.key);
  }
  assert.deepStrictEqual(concernKeys().sort(), [...seen].sort());
});

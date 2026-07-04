'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { countBehaviors, isSingleBehavior } = require('../bin/behavior-count.js');

test('a single Given/When/Then criterion is one behavior', () => {
  assert.strictEqual(countBehaviors('Given a logged-in user, When they open the dashboard, Then their name shows'), 1);
  assert.strictEqual(isSingleBehavior('Given X, When Y, Then Z'), true);
});

test('multiple When/Then pairs count as multiple behaviors → the task should be split', () => {
  const text = 'When the user logs in, then show the dashboard.\nWhen the user logs out, then clear the session.';
  assert.strictEqual(countBehaviors(text), 2);
  assert.strictEqual(isSingleBehavior(text), false);
});

test('counts behaviors across bullet/numbered lists too', () => {
  const text = [
    '- When a valid card is entered, then the payment succeeds',
    '- When an expired card is entered, then an error is shown',
    '- When the network drops, then the charge is retried',
  ].join('\n');
  assert.strictEqual(countBehaviors(text), 3);
});

test('prose with no When/Then yields 0 (nothing testable specified yet)', () => {
  assert.strictEqual(countBehaviors('Improve the checkout page.'), 0);
  assert.strictEqual(countBehaviors(''), 0);
});

test('isSingleBehavior: 0 or 1 behavior is single (a lone criterion or an unspecified one); 2+ is not', () => {
  assert.strictEqual(isSingleBehavior(''), true);
  assert.strictEqual(isSingleBehavior('When A then B'), true);
  assert.strictEqual(isSingleBehavior('When A then B. When C then D.'), false);
});

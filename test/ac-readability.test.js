'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { isQaReadable, flagAcs } = require('../bin/ac-readability.js');

test('a plain-language Given/When/Then AC is QA-readable', () => {
  assert.strictEqual(isQaReadable('Given a logged-in user, When they click Save, Then the form is submitted'), true);
  assert.strictEqual(isQaReadable('As a user I can see my upcoming appointments on the dashboard'), true);
  assert.strictEqual(isQaReadable('The dashboard shows the total patient count'), true);
});

test('an AC that is only code/file references is NOT QA-readable (QA cannot test it)', () => {
  assert.strictEqual(isQaReadable('bin/slice-size.js assessSlice returns true for behaviors>1'), false);
  assert.strictEqual(isQaReadable('Calls updateRecord() in services/record.ts'), false);
  assert.strictEqual(isQaReadable(''), false);
});

test('flagAcs returns the non-readable criteria with their index for the author to fix', () => {
  const acs = [
    'Given an expired session, When the user acts, Then they are redirected to login',
    'PatientRepo.findById() is invoked with the id',
  ];
  const flagged = flagAcs(acs);
  assert.strictEqual(flagged.length, 1);
  assert.strictEqual(flagged[0].index, 1);
});

test('code references are allowed AS WELL AS a plain statement (dual phrasing is fine)', () => {
  assert.strictEqual(isQaReadable('The user sees an error toast when the save fails (see `saveHandler` in form.ts)'), true);
});

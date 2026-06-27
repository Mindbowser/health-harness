'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { detectPhiSignals } = require('../bin/criteria-detect.js');

test('detectPhiSignals: flags PHI access tokens on ADDED diff lines; ignores removed lines + headers', () => {
  const diff = [
    '+++ b/src/record.js',
    '+const patient = repo.getPatient(mrn);',
    '-const old = 1;',
    '+function dosing(){ return diagnosis; }',
    ' context line unchanged',
  ].join('\n');
  assert.deepStrictEqual(detectPhiSignals(diff), ['patient', 'mrn', 'diagnosis']);
  // a removed PHI line does NOT count (we only gate what the slice ADDS)
  assert.deepStrictEqual(detectPhiSignals('-const ssn = user.ssn;'), []);
  // the +++ file header is not a content line even if the path contains a token
  assert.deepStrictEqual(detectPhiSignals('+++ b/patient/list.js'), []);
  // word-bounded: "patients" / "compatient" don't false-match "patient"
  assert.deepStrictEqual(detectPhiSignals('+const compatients = 3;'), []);
  assert.deepStrictEqual(detectPhiSignals('+const x = 1;'), []);
  assert.deepStrictEqual(detectPhiSignals(''), []);
});

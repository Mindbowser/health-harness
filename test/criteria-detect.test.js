'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { detectPhiSignals, detectLoggingIntroduced, detectDateTimeApi, hasTzMarker } = require('../bin/criteria-detect.js');

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

test('detectLoggingIntroduced: true when an added line wires a logger or raw console.*; removed lines ignored', () => {
  assert.strictEqual(detectLoggingIntroduced('+const log = createLogger();'), true);
  assert.strictEqual(detectLoggingIntroduced('+import winston from "winston";'), true);
  assert.strictEqual(detectLoggingIntroduced('+  console.error("boom");'), true);
  assert.strictEqual(detectLoggingIntroduced('+const log = pino();'), true);
  // a removed logger line does not count (we gate what's added)
  assert.strictEqual(detectLoggingIntroduced('-console.log("gone");'), false);
  assert.strictEqual(detectLoggingIntroduced('+const total = sum(a, b);'), false);
  assert.strictEqual(detectLoggingIntroduced(''), false);
});

test('detectDateTimeApi: true when an added line uses a date/time API; removed lines ignored', () => {
  assert.strictEqual(detectDateTimeApi('+const t = new Date();'), true);
  assert.strictEqual(detectDateTimeApi('+const n = Date.now();'), true);
  assert.strictEqual(detectDateTimeApi('+import dayjs from "dayjs";'), true);
  assert.strictEqual(detectDateTimeApi('+  return moment(x).utc();'), true);
  assert.strictEqual(detectDateTimeApi('-const t = new Date();'), false);
  assert.strictEqual(detectDateTimeApi('+const total = a + b;'), false);
  assert.strictEqual(detectDateTimeApi(''), false);
});

test('detectDateTimeApi: language-agnostic — fires on Python/Ruby/.NET/PHP/Go/Java date APIs, not just JS', () => {
  // Python
  assert.strictEqual(detectDateTimeApi('+from datetime import datetime'), true, 'py datetime');
  assert.strictEqual(detectDateTimeApi('+    return dt.astimezone(tz)'), true, 'py astimezone');
  assert.strictEqual(detectDateTimeApi('+from zoneinfo import ZoneInfo'), true, 'py zoneinfo');
  assert.strictEqual(detectDateTimeApi('+    now = datetime.utcnow()'), true, 'py utcnow');
  // Ruby
  assert.strictEqual(detectDateTimeApi('+    t = Time.now'), true, 'ruby Time.now');
  assert.strictEqual(detectDateTimeApi('+    t.in_time_zone("UTC")'), true, 'ruby in_time_zone');
  // .NET / C#
  assert.strictEqual(detectDateTimeApi('+        var t = DateTime.UtcNow;'), true, 'dotnet DateTime');
  assert.strictEqual(detectDateTimeApi('+        DateTimeOffset o = ...;'), true, 'dotnet DateTimeOffset');
  // PHP
  assert.strictEqual(detectDateTimeApi('+    $t = strtotime($s);'), true, 'php strtotime');
  // C / POSIX
  assert.strictEqual(detectDateTimeApi('+    strftime(buf, n, fmt, tm);'), true, 'c strftime');
  // Go + Java still fire (regression guard for the originally-covered tokens)
  assert.strictEqual(detectDateTimeApi('+    t := time.Now()'), true, 'go time.Now');
  assert.strictEqual(detectDateTimeApi('+        LocalDate d = LocalDate.now();'), true, 'java LocalDate');
  // Must NOT over-fire on non-date code that merely contains a substring
  assert.strictEqual(detectDateTimeApi('+    const updated = a + b;'), false, 'no false positive on "updated"');
  assert.strictEqual(detectDateTimeApi('+    validate(payload);'), false, 'no false positive on "date" in validate');
});

test('hasTzMarker: true when an added line carries an explicit // tz-safe / @tz-safe acknowledgement', () => {
  assert.strictEqual(hasTzMarker('+const t = new Date(); // tz-safe: stored UTC'), true);
  assert.strictEqual(hasTzMarker('+// @tz-safe handled by caller'), true);
  assert.strictEqual(hasTzMarker('+const t = new Date();'), false);
  assert.strictEqual(hasTzMarker(''), false);
});

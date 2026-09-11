'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { scanText, classesForProfile, luhnValid } = require('../bin/redaction-scan.js');

const classesOf = (hits) => new Set(hits.map((h) => h.class));

test('default profile is hipaa → phi/pii/secrets', () => {
  assert.deepStrictEqual(classesForProfile('hipaa'), ['phi', 'pii', 'secrets']);
  assert.deepStrictEqual(classesForProfile(undefined), ['phi', 'pii', 'secrets']); // unknown ⇒ default
  assert.deepStrictEqual(classesForProfile('none'), ['secrets']);
});

test('secrets are caught under every profile', () => {
  const opts = { classes: classesForProfile('none') };
  assert.ok(scanText('const k = "AKIA1234567890ABCDEF";', opts).some((h) => h.class === 'secrets'));
  assert.ok(scanText('api_key: "sk_live_abcdefghijklmnop"', opts).some((h) => h.class === 'secrets'));
  assert.ok(scanText('DATABASE_URL=postgres://user:p4ss@db.internal:5432/app', opts).some((h) => h.class === 'secrets'));
  assert.ok(scanText('-----BEGIN RSA PRIVATE KEY-----', opts).some((h) => h.class === 'secrets'));
});

test('hipaa catches PHI + PII identifiers', () => {
  const opts = { classes: classesForProfile('hipaa') };
  assert.ok(scanText('patient SSN 123-45-6789', opts).some((h) => h.class === 'pii'));
  assert.ok(scanText('contact: jane.doe@example.com', opts).some((h) => h.class === 'pii'));
  assert.ok(scanText('call (415) 555-0182 today', opts).some((h) => h.class === 'pii'));
  assert.ok(scanText('MRN: 0099123', opts).some((h) => h.class === 'phi'));
  assert.ok(scanText('DOB = 1980-02-11', opts).some((h) => h.class === 'phi'));
});

test('clean synthetic-reference code passes hipaa', () => {
  const opts = { classes: classesForProfile('hipaa') };
  const code = [
    'logger.info({ recordId, correlationId });',
    'const patient = await repo.find(patientId);',
    'return res.json({ id: patient.id });',
  ].join('\n');
  assert.deepStrictEqual(scanText(code, opts), []);
});

test('pan only under pci, and must be Luhn-valid', () => {
  assert.ok(luhnValid('4111111111111111'));         // valid test Visa
  assert.ok(!luhnValid('4111111111111112'));          // bad checksum
  const pci = { classes: classesForProfile('pci') };
  assert.ok(scanText('card 4111 1111 1111 1111', pci).some((h) => h.class === 'pan'));
  // gdpr does not enforce pan
  assert.ok(!scanText('card 4111 1111 1111 1111', { classes: classesForProfile('gdpr') }).some((h) => h.class === 'pan'));
});

test('commercial is opt-in (off by default, on when class added)', () => {
  const line = 'Deal closed at $120,000 — Closed Won';
  assert.ok(!scanText(line, { classes: classesForProfile('hipaa') }).some((h) => h.class === 'commercial'));
  assert.ok(scanText(line, { classes: ['secrets', 'commercial'] }).some((h) => h.class === 'commercial'));
});

test('allow exempts a confirmed false positive; deny catches a named string', () => {
  const opts = { classes: classesForProfile('hipaa'), allow: ['support@mindbowser.com'], deny: ['John Q Patient'] };
  assert.ok(!scanText('email support@mindbowser.com', opts).some((h) => h.class === 'pii'));
  assert.ok(scanText('seen by John Q Patient', opts).some((h) => h.class === 'deny'));
});

test('hits carry file + line + class + snippet', () => {
  const hits = scanText('ok\nSSN 123-45-6789\n', { classes: classesForProfile('hipaa') }, 'x.ts');
  assert.strictEqual(hits[0].file, 'x.ts');
  assert.strictEqual(hits[0].line, 2);
  assert.strictEqual(hits[0].class, 'pii');
  assert.ok(hits[0].snippet.includes('SSN'));
});

// ── MBI-152: diff-scoped scan + generalized allow-suppression ──
const rs = require('../bin/redaction-scan.js');
const SECRET = 'AKIA' + 'IOSFODNN7EXAMPLE'; // canonical synthetic AWS example key

test('[AC-1/AC-2] scanDiffAddedLines: only ADDED lines are scanned, with correct file + new-line number', () => {
  const diff = [
    'diff --git a/config.js b/config.js',
    '--- a/config.js',
    '+++ b/config.js',
    '@@ -1,3 +1,4 @@',
    ' const a = 1;',            // context — not scanned
    '-const old = "removed";',  // removed — not scanned
    '+const key = "' + SECRET + '";', // added — scanned (new line 2)
    ' const b = 2;',
  ].join('\n');
  const hits = rs.scanDiffAddedLines(diff, { classes: ['secrets'] });
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].class, 'secrets');
  assert.strictEqual(hits[0].file, 'config.js');
  assert.strictEqual(hits[0].line, 2); // new-file line number within the hunk

  // AC-2: a secret only on a CONTEXT/removed line (already existed) → no hit
  const unrelated = [
    '--- a/config.js', '+++ b/config.js', '@@ -1,2 +1,2 @@',
    ' const key = "' + SECRET + '";', // context (pre-existing) — not scanned
    '+const c = 3;',
  ].join('\n');
  assert.strictEqual(rs.scanDiffAddedLines(unrelated, { classes: ['secrets'] }).length, 0);
});

test('[AC-3] allow-suppression is generalized to secrets (a line containing an allow value is skipped)', () => {
  const line = 'const key = "' + SECRET + '";';
  assert.strictEqual(scanText(line, { classes: ['secrets'] }).length, 1);           // no allow → hit
  assert.strictEqual(scanText(line, { classes: ['secrets'], allow: [SECRET] }).length, 0); // allow-listed → skipped
});

test('loadConfig normalizes object allow entries {value,reason,by,at} to values', () => {
  const fs = require('fs'), os = require('os'), path = require('path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rs-allow-'));
  fs.mkdirSync(path.join(dir, '.health-harness'), { recursive: true });
  fs.writeFileSync(path.join(dir, '.health-harness', 'compliance.json'),
    JSON.stringify({ profile: 'hipaa', allow: [{ value: SECRET, reason: 'example key in docs', by: 'x@y', at: '2026-01-01' }, 'plainstring'] }));
  const cfg = rs.loadConfig(dir);
  assert.deepStrictEqual(cfg.allow.sort(), [SECRET, 'plainstring'].sort());
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { findAuditGaps, auditEntryFields } = require('../bin/audit-scan.js');

test('flags a PHI read with no audit emission nearby', () => {
  const gaps = findAuditGaps('async function getChart(id) {\n  const rec = await Patient.findById(id);\n  return rec;\n}');
  assert.strictEqual(gaps.length, 1);
  assert.strictEqual(gaps[0].line, 2);
});

test('a PHI access WITH an audit call within the window is not a gap', () => {
  const code = [
    'const rec = await Patient.findById(id);',
    'audit.record({ actor: userId, action: "read", recordId: id, outcome: "ok" });',
  ].join('\n');
  assert.deepStrictEqual(findAuditGaps(code), []);
});

test('recognizes op+entity call shapes (getPatient / updateMedicalRecord)', () => {
  assert.strictEqual(findAuditGaps('const p = await getPatient(id);').length, 1);
  assert.strictEqual(findAuditGaps('await updateMedicalRecord(id, patch);').length, 1);
});

test('a custom audit-helper name is honored', () => {
  const code = 'const rec = await Patient.findById(id);\nrecordAccess(userId, id);';
  assert.deepStrictEqual(findAuditGaps(code, { auditRe: /recordAccess/ }), []);
});

test('non-PHI data access is never a gap', () => {
  assert.deepStrictEqual(findAuditGaps('const cfg = await Settings.findOne();\nconst n = list.map(x => x + 1);'), []);
});

test('auditEntryFields lists the compliant-entry fields (who/what/subject/when/outcome)', () => {
  const fields = auditEntryFields().map((f) => f.field);
  for (const f of ['actor', 'action', 'subject', 'timestamp', 'outcome']) assert.ok(fields.includes(f), `missing ${f}`);
});

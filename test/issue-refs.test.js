'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { extractIssueKeys, NOISE_PREFIXES } = require('../bin/issue-refs.js');

test('[AC-1] keys named in the invocation are extracted, in order, deduped', () => {
  const t = 'align MBI-123 — see also MBI-100 and MBI-101, plus MBI-100 again';
  assert.deepStrictEqual(extractIssueKeys(t), ['MBI-123', 'MBI-100', 'MBI-101']);
});

test('[AC-2] keys referenced inside the ticket body are extracted', () => {
  const body = 'This depends on MBI-90 and blocks COH-12.\nSee ACME-7 for the original spec.';
  assert.deepStrictEqual(extractIssueKeys(body), ['MBI-90', 'COH-12', 'ACME-7']);
});

test('[AC-3] key-shaped noise is never treated as an issue key', () => {
  const noisy = 'AC-1 covers UTF-8 and ISO-8601; see RFC-2606, SHA-256, AES-256, CVE-2021-4034, HTTP-2';
  assert.deepStrictEqual(extractIssueKeys(noisy), []);
  // the acceptance-criteria id is the one that would bite hardest in this repo
  assert.deepStrictEqual(extractIssueKeys('[AC-1] Given x, When y, Then z'), []);
  assert.ok(NOISE_PREFIXES.includes('AC'));
});

test('[AC-4] the target key is excluded — it is already being aligned', () => {
  const t = 'align MBI-123 with context from MBI-100';
  assert.deepStrictEqual(extractIssueKeys(t, { exclude: 'MBI-123' }), ['MBI-100']);
  assert.deepStrictEqual(extractIssueKeys(t, { exclude: ['MBI-123', 'MBI-100'] }), []);
});

test('[AC-5] a known project key narrows extraction to that project only', () => {
  const t = 'MBI-1 relates to COH-2 and ACME-3';
  assert.deepStrictEqual(extractIssueKeys(t, { projectKeys: ['MBI'] }), ['MBI-1']);
  assert.deepStrictEqual(extractIssueKeys(t, { projectKeys: ['MBI', 'COH'] }), ['MBI-1', 'COH-2']);
  // a project key is matched case-insensitively but returned normalized
  assert.deepStrictEqual(extractIssueKeys('see mbi-9', { projectKeys: ['MBI'] }), ['MBI-9']);
});

test('[AC-6] the list is capped so alignment context stays bounded', () => {
  const many = Array.from({ length: 40 }, (_, i) => `MBI-${i + 1}`).join(' ');
  assert.strictEqual(extractIssueKeys(many).length, 10);          // default cap
  assert.strictEqual(extractIssueKeys(many, { max: 3 }).length, 3);
});

test('empty / junk input never throws', () => {
  assert.deepStrictEqual(extractIssueKeys(''), []);
  assert.deepStrictEqual(extractIssueKeys(null), []);
  assert.deepStrictEqual(extractIssueKeys(undefined), []);
});

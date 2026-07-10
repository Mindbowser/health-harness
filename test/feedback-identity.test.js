'use strict';
// MBI-125 — feedback identity: when git email is unset AND the dev didn't choose anonymous, identity is
// "unresolved" → the flow must confirm an email (or explicit anonymous), never send a silent null userId.
const { test } = require('node:test');
const assert = require('node:assert');
const { resolveFeedbackIdentity, previewFeedback, appendFeedback } = require('../bin/usage-log.js');

const NOEMAIL = () => null;                 // git email unset
const EMAIL   = () => 'dev@mindbowser.com'; // git email present
const BASE = { type: 'idea', summary: 'x', detail: 'y' };

test('resolveFeedbackIdentity: explicit userId wins; else git email; empty → unresolved; anonymous → deliberate null', () => {
  assert.deepStrictEqual(resolveFeedbackIdentity({ userId: ' me@x.com ' }, NOEMAIL), { userId: 'me@x.com', unresolved: false });
  assert.deepStrictEqual(resolveFeedbackIdentity({}, EMAIL), { userId: 'dev@mindbowser.com', unresolved: false });
  assert.deepStrictEqual(resolveFeedbackIdentity({}, NOEMAIL), { userId: null, unresolved: true });
  assert.deepStrictEqual(resolveFeedbackIdentity({ anonymous: true }, NOEMAIL), { userId: null, unresolved: false });
});

test('previewFeedback: flags identityUnresolved with no email + not anonymous; cleared by an email or explicit anonymous', () => {
  const unres = previewFeedback(BASE, { gitEmail: NOEMAIL });
  assert.strictEqual(unres.ok, true);
  assert.strictEqual(unres.identityUnresolved, true);
  assert.strictEqual(unres.record.userId, null);

  const withEmail = previewFeedback(BASE, { gitEmail: EMAIL });
  assert.strictEqual(withEmail.identityUnresolved, false);
  assert.strictEqual(withEmail.record.userId, 'dev@mindbowser.com');

  const explicit = previewFeedback({ ...BASE, userId: 'me@x.com' }, { gitEmail: NOEMAIL });
  assert.strictEqual(explicit.identityUnresolved, false);
  assert.strictEqual(explicit.record.userId, 'me@x.com');

  const anon = previewFeedback({ ...BASE, anonymous: true }, { gitEmail: NOEMAIL });
  assert.strictEqual(anon.identityUnresolved, false);
  assert.strictEqual(anon.record.userId, null);
});

test('appendFeedback: REFUSES to write an unattributed record (no email, not anonymous) — no silent null', () => {
  const res = appendFeedback(BASE, { gitEmail: NOEMAIL });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.identityUnresolved, true);
  assert.ok(/anonymous|identity|email/i.test(res.message || res.error || ''), 'message should tell the caller how to resolve it');
});

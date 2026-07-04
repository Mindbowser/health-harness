'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { findStackLeaks, hasStackLeak } = require('../bin/error-safety.js');

test('flags a stack trace sent to the user', () => {
  const leaks = findStackLeaks('app.use((err, req, res, next) => { res.status(500).send(err.stack); });');
  assert.strictEqual(leaks.length, 1);
  assert.strictEqual(leaks[0].kind, 'stack-to-user');
  assert.strictEqual(leaks[0].line, 1);
});

test('flags a raw error object returned in the response', () => {
  assert.ok(hasStackLeak('res.status(500).json(err)'));            // the whole error object
  assert.ok(hasStackLeak('res.json({ error: err })'));             // error object nested in the body
  assert.ok(hasStackLeak('res.status(400).json({ message: error.message })')); // internal message to the user
});

test('does NOT flag a clean, user-friendly error response', () => {
  assert.strictEqual(hasStackLeak('res.status(500).json({ error: "Something went wrong. Ref: " + refId })'), false);
  assert.strictEqual(hasStackLeak('res.status(404).send("Not found")'), false);
});

test('does NOT flag logging the error to the server log (that is correct — detail goes to logs)', () => {
  const code = [
    'logger.error(err);',                                  // full detail → logs: fine
    'console.error(err.stack);',                           // stack → logs: fine',
    'res.status(500).json({ error: "Internal error", ref: id });', // clean user message: fine
  ].join('\n');
  assert.strictEqual(hasStackLeak(code), false);
});

test('does NOT flag forwarding to an error handler (next(err))', () => {
  assert.strictEqual(hasStackLeak('if (err) return next(err);'), false);
});

test('findStackLeaks reports the 1-based line for each leak', () => {
  const code = 'const a = 1;\nres.send(err.stack);\nconst b = 2;';
  const leaks = findStackLeaks(code);
  assert.strictEqual(leaks.length, 1);
  assert.strictEqual(leaks[0].line, 2);
});

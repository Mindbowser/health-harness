'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { eventsFromHook, sanitize } = require('../bin/usage-log.js');

test('sanitize keeps only allowlisted scalar fields (metadata-only guarantee)', () => {
  // 'tool' allows tool, ok — drop everything else, incl. any content/object
  assert.deepStrictEqual(sanitize('tool', { tool: 'Bash', ok: true, command: 'rm secret', extra: { a: 1 } }),
    { tool: 'Bash', ok: true });
  // unknown event → dropped entirely (null)
  assert.strictEqual(sanitize('prompt_text', { text: 'PHI here' }), null);
  // objects are never stored
  assert.deepStrictEqual(sanitize('edit', { ext: 'ts', payload: { code: 'x' } }), { ext: 'ts' });
});

test('PostToolUse → tool (+ edit ext) (+ gate_run) events, metadata only', () => {
  assert.deepStrictEqual(eventsFromHook('posttooluse', { tool_name: 'Edit', tool_input: { file_path: '/a/b/x.ts' } }),
    [{ event: 'tool', data: { tool: 'Edit', ok: true } }, { event: 'edit', data: { ext: 'ts' } }]);
  // gate command → gate_run pass
  const g = eventsFromHook('posttooluse', { tool_name: 'Bash', tool_input: { command: 'npm test' } });
  assert.deepStrictEqual(g[0], { event: 'tool', data: { tool: 'Bash', ok: true } });
  assert.deepStrictEqual(g[1], { event: 'gate_run', data: { result: 'pass' } });
  // a non-gate bash command → no gate_run
  const ng = eventsFromHook('posttooluse', { tool_name: 'Bash', tool_input: { command: 'git status' } });
  assert.strictEqual(ng.length, 1);
});

test('PostToolUseFailure on a gate command → gate_run fail', () => {
  const f = eventsFromHook('posttoolfail', { tool_name: 'Bash', tool_input: { command: 'npm test' } });
  assert.deepStrictEqual(f[0], { event: 'tool', data: { tool: 'Bash', ok: false } });
  assert.deepStrictEqual(f[1], { event: 'gate_run', data: { result: 'fail' } });
});

test('command hook → command name (no content)', () => {
  assert.deepStrictEqual(eventsFromHook('command', { command: '/align ACME-258 as author' }),
    [{ event: 'command', data: { name: 'align' } }]);
});

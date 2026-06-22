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

test('UserPromptSubmit → prompt event (length bucket + context flag, no text)', () => {
  // a short raw one-liner with no file/ticket refs
  assert.deepStrictEqual(eventsFromHook('userpromptsubmit', { prompt: 'make it work' }),
    [{ event: 'prompt', data: { lenBucket: 's', hasContext: false } }]);
  // a long, context-rich prompt (file ref + ticket ref) → hasContext true, no text stored
  const long = 'Refactor src/foo/bar.ts for ACME-258 '.repeat(20);
  const e = eventsFromHook('userpromptsubmit', { prompt: long });
  assert.strictEqual(e[0].event, 'prompt');
  assert.strictEqual(e[0].data.lenBucket, 'l');
  assert.strictEqual(e[0].data.hasContext, true);
  assert.ok(!('prompt' in e[0].data) && !('text' in e[0].data)); // never the text
});

test('UserPromptSubmit that is a slash command → command + prompt events (with Jira key)', () => {
  const e = eventsFromHook('userpromptsubmit', { prompt: '/tdd ACME-258' });
  // the Jira key rides along so work can be sliced by ticket / type / priority (Atlas joins it)
  assert.deepStrictEqual(e.find((x) => x.event === 'command'), { event: 'command', data: { name: 'tdd', issueKey: 'ACME-258' } });
  assert.strictEqual(e.find((x) => x.event === 'prompt').data.issueKey, 'ACME-258');
  // no key → no issueKey field; plugin namespace stripped
  const ns = eventsFromHook('userpromptsubmit', { prompt: '/health-harness:align foo' });
  assert.deepStrictEqual(ns.find((x) => x.event === 'command'), { event: 'command', data: { name: 'align' } });
});

test('redaction event keeps only the hit count (metadata-only)', () => {
  assert.deepStrictEqual(sanitize('redaction', { hits: 3, file: '/secret/path.ts', snippet: 'PHI' }), { hits: 3 });
});

test('hygiene signals are allowlisted (breaking_change / migration / migration_gap)', () => {
  assert.deepStrictEqual(sanitize('breaking_change', { kind: 'api', confirmed: true, detail: 'renamed field x' }),
    { kind: 'api', confirmed: true }); // free-text `detail` dropped
  assert.deepStrictEqual(sanitize('migration', { pattern: 'expand-contract', sql: 'DROP ...' }), { pattern: 'expand-contract' });
  assert.deepStrictEqual(sanitize('migration_gap', { reason: 'no-orm' }), { reason: 'no-orm' });
});

test('parseKv coerces booleans + numbers, ignores malformed pairs', () => {
  const { parseKv } = require('../bin/usage-log.js');
  assert.deepStrictEqual(parseKv(['kind=api', 'confirmed=true', 'n=3', 'bad']), { kind: 'api', confirmed: true, n: 3 });
});

test('PostToolUse Bash git commit → commit event; revert/reset → revert event (objecting signal)', () => {
  const c = eventsFromHook('posttooluse', { tool_name: 'Bash', tool_input: { command: 'git commit -m "x"' } });
  assert.ok(c.find((x) => x.event === 'commit'), 'git commit should emit a commit event');
  const r = eventsFromHook('posttooluse', { tool_name: 'Bash', tool_input: { command: 'git checkout -- src/a.ts' } });
  assert.ok(r.find((x) => x.event === 'revert'), 'git checkout -- <file> should emit a revert event');
  const rh = eventsFromHook('posttooluse', { tool_name: 'Bash', tool_input: { command: 'git reset --hard HEAD~1' } });
  assert.ok(rh.find((x) => x.event === 'revert'), 'git reset --hard should emit a revert event');
  // a plain commit is not a revert and vice-versa
  assert.ok(!c.find((x) => x.event === 'revert'));
  assert.ok(!r.find((x) => x.event === 'commit'));
});

test('PreCompact → compaction event; SubagentStop → subagent event', () => {
  assert.deepStrictEqual(eventsFromHook('precompact', {}), [{ event: 'compaction', data: {} }]);
  assert.deepStrictEqual(eventsFromHook('subagentstop', {}), [{ event: 'subagent', data: {} }]);
});

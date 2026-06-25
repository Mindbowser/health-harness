'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { eventsFromHook, sanitize, fingerprintUnits, commitFingerprint, ticketTransitions, inferStageRoles, dedupeTransitions } = require('../bin/usage-log.js');

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

// ── relation facts in the JSONL (recompute-complete: store raw inputs, not just derived verdicts) ──

test('graphMetaFor: snapshots the issue graph edges (raw facts) + clusterKey cache + type/priority', () => {
  const { graphMetaFor } = require('../bin/usage-log.js');
  const graph = {
    'MBI-14': { parent: 'MBI-10', epic: 'MBI-1', links: ['MBI-20', 'MBI-21'], type: 'Story', priority: 'P2' },
    'MBI-99': {}, // known key, no edges
  };
  // full edges → links flattened to a scalar string of Jira keys; clusterKey = epic; type/priority carried
  assert.deepStrictEqual(graphMetaFor('MBI-14', graph),
    { key: 'MBI-14', parent: 'MBI-10', epic: 'MBI-1', links: 'MBI-20,MBI-21', clusterKey: 'MBI-1', type: 'Story', priority: 'P2' });
  // no edges → nulls, clusterKey falls back to the key itself; type/priority omitted when unknown
  assert.deepStrictEqual(graphMetaFor('MBI-99', graph),
    { key: 'MBI-99', parent: null, epic: null, links: null, clusterKey: 'MBI-99' });
  // unknown key → still a valid self-cluster fact (parent>epic fallback chain)
  assert.deepStrictEqual(graphMetaFor('MBI-7', { 'MBI-7': { parent: 'MBI-5' } }),
    { key: 'MBI-7', parent: 'MBI-5', epic: null, links: null, clusterKey: 'MBI-5' });
  // no key → nothing to ship
  assert.strictEqual(graphMetaFor('', graph), null);
});

test('issue_meta event is allowlisted to its raw-fact + cache + type/priority fields only', () => {
  // raw facts (key/parent/epic/links) + cache (clusterKey) + filter fields (type/priority) kept; rest dropped
  assert.deepStrictEqual(
    sanitize('issue_meta', { key: 'MBI-14', parent: 'MBI-10', epic: 'MBI-1', links: 'MBI-20', clusterKey: 'MBI-1', type: 'Bug', priority: 'P1', summary: 'PHI?' }),
    { key: 'MBI-14', parent: 'MBI-10', epic: 'MBI-1', links: 'MBI-20', clusterKey: 'MBI-1', type: 'Bug', priority: 'P1' });
});

test('session_start carries issueKey; commit gets issueKey from the branch', () => {
  // session_start now allows issueKey (per-ticket attribution); empty payload still valid
  assert.deepStrictEqual(sanitize('session_start', { issueKey: 'MBI-14', junk: 1 }), { issueKey: 'MBI-14' });
  assert.deepStrictEqual(sanitize('commit', { sizeBucket: 's', branchKind: 'feature', issueKey: 'MBI-14' }),
    { sizeBucket: 's', branchKind: 'feature', issueKey: 'MBI-14' });
});

test('issue_switch stores RAW inputs (newKey/relatedTo/thresholdK) alongside the derived verdict', () => {
  // so a future relatedness rule or size threshold can be replayed over history
  assert.deepStrictEqual(
    sanitize('issue_switch', { contextBucket: '40-60k', tier: 'unrelated', nudged: true, newKey: 'MBI-30', relatedTo: 'MBI-14', thresholdK: 40, extra: 'x' }),
    { contextBucket: '40-60k', tier: 'unrelated', nudged: true, newKey: 'MBI-30', relatedTo: 'MBI-14', thresholdK: 40 });
});

// MBI-43 — the pure fn maps a failed gate to gate_run:fail, but in production NOTHING invoked it:
// hooks.json wired only PostToolUse (success-only), so every real gate run was recorded 'pass'. Claude
// Code routes tool failures to the separate PostToolUseFailure event — this pins that it's actually wired.
test('hooks.json wires PostToolUseFailure → usage-log posttoolfail so failing gates are captured (regression: all-pass bug)', () => {
  const groups = require('../hooks/hooks.json').hooks.PostToolUseFailure;
  assert.ok(Array.isArray(groups) && groups.length > 0, 'PostToolUseFailure must be registered');
  const entries = groups.flatMap((g) => (g.hooks || []).map((h) => ({ matcher: g.matcher, command: h.command })));
  const wired = entries.find((e) => /usage-log\.js"?\s+posttoolfail\b/.test(e.command));
  assert.ok(wired, 'a PostToolUseFailure hook must run usage-log.js posttoolfail');
  assert.ok(/\bBash\b/.test(wired.matcher || ''), 'the failure hook must match Bash (gate commands run via Bash)');
});

// MBI-44 — ticket_transition changelog stream. The producer walks Jira's changelog and emits one raw
// transition per status change (status label + Jira category + timestamp). The dashboard segments
// dev-time vs QA-wait downstream. Status labels are workflow names (not sensitive); categories come from
// a supplied id→category map so custom statuses still map.
const CHANGELOG = {
  histories: [
    { created: '2026-06-25T10:00:00.000+0530', items: [
      { field: 'assignee', fromString: 'A', toString: 'B' },
      { field: 'status', from: '1', fromString: 'In Progress', to: '2', toString: 'In Review' },
    ] },
    { created: '2026-06-26T12:00:00.000+0530', items: [
      { field: 'status', from: '2', fromString: 'In Review', to: '3', toString: 'Done' },
    ] },
  ],
};
const STATUS_CAT = { 1: 'indeterminate', 2: 'indeterminate', 3: 'done' };

test('MBI-44: changelog → one ticket_transition per status change (status label + category + at); non-status items ignored', () => {
  const evs = ticketTransitions('MBI-43', CHANGELOG, STATUS_CAT);
  assert.strictEqual(evs.length, 2);
  assert.deepStrictEqual(evs[0], { issueKey: 'MBI-43', fromStatus: 'In Progress', toStatus: 'In Review', fromCat: 'indeterminate', toCat: 'indeterminate', at: '2026-06-25T10:00:00.000+0530' });
  assert.deepStrictEqual(evs[1], { issueKey: 'MBI-43', fromStatus: 'In Review', toStatus: 'Done', fromCat: 'indeterminate', toCat: 'done', at: '2026-06-26T12:00:00.000+0530' });
});

test('MBI-44: custom-status-safe — an unmapped status id → category unknown, but the status NAME is kept', () => {
  const cl = { histories: [ { created: '2026-06-25T10:00:00.000+0530', items: [
    { field: 'status', from: '9', fromString: 'Pending Signoff', to: '3', toString: 'Done' } ] } ] };
  const evs = ticketTransitions('MBI-50', cl, { 3: 'done' }); // '9' (custom) not in the map
  assert.strictEqual(evs[0].fromCat, 'unknown');
  assert.strictEqual(evs[0].fromStatus, 'Pending Signoff'); // never lost
  assert.strictEqual(evs[0].toCat, 'done');
});

test('MBI-44: dedupe by issueKey+at — a transition seen on a prior read is not re-emitted', () => {
  const all = ticketTransitions('MBI-43', CHANGELOG, STATUS_CAT);
  const first = dedupeTransitions(all, []);
  assert.strictEqual(first.fresh.length, 2);
  const second = dedupeTransitions(all, first.keys); // re-read with prior keys → nothing fresh
  assert.strictEqual(second.fresh.length, 0);
});

test('MBI-44: empty / garbage / no-issueKey changelog → [] and never throws', () => {
  assert.deepStrictEqual(ticketTransitions('MBI-1', { histories: [] }, {}), []);
  assert.deepStrictEqual(ticketTransitions('MBI-1', null, null), []);
  assert.deepStrictEqual(ticketTransitions('MBI-1', 'not a changelog', {}), []);
  assert.deepStrictEqual(ticketTransitions('', CHANGELOG, STATUS_CAT), []); // no key → nothing
});

test('MBI-44: privacy — ticket_transition allowlist keeps only the 6 metadata fields', () => {
  assert.deepStrictEqual(
    sanitize('ticket_transition', { issueKey: 'MBI-43', fromStatus: 'In Review', toStatus: 'Done', fromCat: 'indeterminate', toCat: 'done', at: '2026-06-26T12:00:00.000+0530', summary: 'PHI?', assignee: 'Jane Doe', comment: 'note' }),
    { issueKey: 'MBI-43', fromStatus: 'In Review', toStatus: 'Done', fromCat: 'indeterminate', toCat: 'done', at: '2026-06-26T12:00:00.000+0530' });
});

test('MBI-44: inferStageRoles maps by category + name; flags needsConfirm for a custom/ambiguous status', () => {
  // standard workflow → every indeterminate status classified, no confirmation needed
  const std = inferStageRoles([
    { name: 'To Do', category: 'new' },
    { name: 'In Progress', category: 'indeterminate' },
    { name: 'In Review', category: 'indeterminate' },
    { name: 'QA', category: 'indeterminate' },
    { name: 'Done', category: 'done' },
  ]);
  assert.strictEqual(std.roles['To Do'], 'todo');
  assert.strictEqual(std.roles['In Progress'], 'active');
  assert.strictEqual(std.roles['In Review'], 'review');
  assert.strictEqual(std.roles['QA'], 'qa');
  assert.strictEqual(std.roles['Done'], 'ship');
  assert.strictEqual(std.needsConfirm, false);
  // a custom in-progress status that matches no heuristic → safe default + needsConfirm (confirm once)
  const custom = inferStageRoles([
    { name: 'In Progress', category: 'indeterminate' },
    { name: 'Pending Signoff', category: 'indeterminate' },
    { name: 'Done', category: 'done' },
  ]);
  assert.strictEqual(custom.needsConfirm, true);
  assert.strictEqual(custom.roles['Pending Signoff'], 'active'); // defaulted, but flagged to confirm
});

// MBI-42 — commit symbol fingerprint. git already names the enclosing symbol in its hunk headers
// (`@@ -a,b +c,d @@ <section>`), so we parse that — no parser dependency. The fp is a one-way hash of
// path+symbol so the raw path/symbol never land on disk.
const PATCH_FOO = [
  'diff --git a/big.js b/big.js',
  'index 1111111..2222222 100644',
  '--- a/big.js',
  '+++ b/big.js',
  '@@ -10,7 +10,8 @@ function foo() {',
  '   const x = 1;',
  '-  return x;',
  '+  return x + 1;',
  '+  // bump',
  ' }',
].join('\n');

test('MBI-42: commitFingerprint hashes path+enclosing symbol → fpConf symbol, stable hex hash, no raw leak', () => {
  const r = commitFingerprint(PATCH_FOO);
  assert.strictEqual(r.fpConf, 'symbol');
  assert.match(r.fp, /^[0-9a-f]{16}$/);
  assert.strictEqual(commitFingerprint(PATCH_FOO).fp, r.fp);           // deterministic / stable
  assert.ok(!r.fp.includes('big') && !r.fp.includes('foo'), 'hash must not leak raw path/symbol');
});

test('MBI-42: two different functions in the SAME file → different fp (same-file ≠ same logical unit)', () => {
  const patchBar = PATCH_FOO.replace('function foo()', 'function bar()');
  assert.notStrictEqual(commitFingerprint(patchBar).fp, commitFingerprint(PATCH_FOO).fp);
});

test('MBI-42: a headingless hunk → fpConf range (line-range fallback when git names no symbol)', () => {
  const patch = [
    'diff --git a/data.txt b/data.txt',
    '--- a/data.txt',
    '+++ b/data.txt',
    '@@ -1,2 +1,3 @@',
    ' a',
    '+b',
    ' c',
  ].join('\n');
  const r = commitFingerprint(patch);
  assert.strictEqual(r.fpConf, 'range');
  assert.match(r.fp, /^[0-9a-f]{16}$/);
});

test('MBI-42: file-level fallback when a file is named but no hunk; null + never throws on empty/garbage', () => {
  const fileOnly = ['diff --git a/x.js b/x.js', '--- a/x.js', '+++ b/x.js'].join('\n');
  assert.strictEqual(commitFingerprint(fileOnly).fpConf, 'file');
  // no file named at all → null; empty / non-string inputs return null without throwing (fire-and-forget)
  assert.strictEqual(commitFingerprint('just noise, not a diff'), null);
  assert.strictEqual(commitFingerprint(''), null);
  assert.strictEqual(commitFingerprint(null), null);
  assert.strictEqual(commitFingerprint(undefined), null);
});

test('MBI-42: privacy — commit allowlist stores only hashed fp + fpConf, never raw diff/path', () => {
  assert.deepStrictEqual(
    sanitize('commit', { sizeBucket: 's', branchKind: 'feature', issueKey: 'MBI-42', fp: 'a1b2c3d4e5f60718', fpConf: 'symbol', diff: 'secret source', path: '/abs/big.js' }),
    { sizeBucket: 's', branchKind: 'feature', issueKey: 'MBI-42', fp: 'a1b2c3d4e5f60718', fpConf: 'symbol' });
});

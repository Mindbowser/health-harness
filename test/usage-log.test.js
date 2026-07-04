'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { eventsFromHook, sanitize, fingerprintUnits, commitFingerprint, ticketTransitions, inferStageRoles, dedupeTransitions, gateResultTrustworthy } = require('../bin/usage-log.js');

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

test('gateResultTrustworthy (MBI-97): exit code reflects the gate only when the gate is the last command', () => {
  assert.ok(gateResultTrustworthy('npm test'));                          // plain
  assert.ok(gateResultTrustworthy('npm test > /tmp/gate.log 2>&1'));      // AC-1: redirect keeps the gate's exit code
  assert.ok(gateResultTrustworthy('cd app && npm test'));                 // gate is the LAST link → exit reflects it
  assert.ok(!gateResultTrustworthy('npm test; tail -4 /tmp/gate.log'));   // gate not last → aggregate exit is tail's
  assert.ok(!gateResultTrustworthy('npm test 2>&1 | tee /tmp/gate.log')); // piped → exit is tee's, masks failures
  assert.ok(!gateResultTrustworthy('echo hi'));                          // not a gate at all
});

test('eventsFromHook (MBI-97): a redirected gate still records; a mid-chain gate does not (untrustworthy exit)', () => {
  const red = eventsFromHook('posttooluse', { tool_name: 'Bash', tool_input: { command: 'npm test > /tmp/g.log 2>&1' } });
  assert.ok(red.some((e) => e.event === 'gate_run' && e.data.result === 'pass'));
  const chain = eventsFromHook('posttooluse', { tool_name: 'Bash', tool_input: { command: 'npm test; tail -4 /tmp/g.log' } });
  assert.ok(!chain.some((e) => e.event === 'gate_run'));
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

// MBI-46 — wire ticket_transition EMISSION. The changelog carries status ids/names but NOT categories;
// only the current status + transition targets do. So we harvest id→category from the Jira responses the
// agent already fetches, accumulate them across reads (project.json), and map the changelog by id.
const { statusCatFromJira, mergeStatusCategories, transitionsFromIssue } = require('../bin/usage-log.js');

test('MBI-46: statusCatFromJira harvests id→category from current status + transition targets', () => {
  const issue = { fields: { status: { id: '10228', statusCategory: { key: 'done' } } } };
  const transitions = { transitions: [
    { to: { id: '10227', statusCategory: { key: 'indeterminate' } } },
    { to: { id: '10225', statusCategory: { key: 'new' } } },
  ] };
  assert.deepStrictEqual(statusCatFromJira(issue, transitions),
    { '10228': 'done', '10227': 'indeterminate', '10225': 'new' });
  // garbage → {} (never throws)
  assert.deepStrictEqual(statusCatFromJira(null, null), {});
});

test('MBI-46: mergeStatusCategories accumulates across reads (fresh wins)', () => {
  assert.deepStrictEqual(
    mergeStatusCategories({ '10225': 'new' }, { '10227': 'indeterminate', '10225': 'new' }),
    { '10225': 'new', '10227': 'indeterminate' });
  assert.deepStrictEqual(mergeStatusCategories(null, null), {});
});

// MBI-112 (S1) — the `feedback` record type. Unlike every OTHER event (metadata-only, allowlisted, string
// fields capped at 40 chars), `feedback` carries INTENTIONAL free text the dev consented to (PHI-scanned
// upstream in S2), so its string fields are NOT length-capped. The scoped bypass must leave every other
// event's metadata-only guarantee untouched. The record's dedup `id` IS the feedbackId → resend-idempotent.
const { buildFeedbackRecord } = require('../bin/usage-log.js');

test('[AC-1] sanitize(feedback) keeps only allowlisted fields but does NOT cap the free text', () => {
  const longSummary = 'S'.repeat(200);
  const out = sanitize('feedback', {
    type: 'bug', summary: longSummary, detail: 'D'.repeat(100),
    expected: 'e', actual: 'a', severity: 'high', feedbackId: 'fb-1',
    secret: 'not allowlisted', nested: { code: 'x' },
  });
  assert.strictEqual(out.summary, longSummary);   // free text preserved verbatim (200 chars, uncapped)
  assert.strictEqual(out.detail.length, 100);     // uncapped
  assert.strictEqual(out.type, 'bug');
  assert.strictEqual(out.severity, 'high');
  assert.strictEqual(out.feedbackId, 'fb-1');
  assert.ok(!('secret' in out), 'non-allowlisted field dropped');
  assert.ok(!('nested' in out), 'nested objects still dropped');
});

test('[AC-1] buildFeedbackRecord assembles a feedback record with normalized fields + feedbackId', () => {
  const rec = buildFeedbackRecord(
    { type: 'friction', summary: 'x'.repeat(80), detail: 'why', junk: { a: 1 } },
    { id: 'fb-2', ts: '2026-07-04T00:00:00.000Z', userId: 'dev@mb', repoId: 'mb-harness', hv: '0.3.0' });
  assert.strictEqual(rec.event, 'feedback');
  assert.strictEqual(rec.v, 1);
  assert.strictEqual(rec.type, 'friction');
  assert.strictEqual(rec.summary.length, 80);     // uncapped
  assert.strictEqual(rec.feedbackId, 'fb-2');     // defaulted from env id when the payload omits it
  assert.strictEqual(rec.ts, '2026-07-04T00:00:00.000Z');
  assert.strictEqual(rec.userId, 'dev@mb');
  assert.ok(!('junk' in rec), 'objects dropped from the payload');
});

test('[AC-2] non-feedback events still allowlist + 40-char cap + object-drop (regression: bypass is scoped to feedback)', () => {
  const out = sanitize('tool', { tool: 'B'.repeat(100), ok: true, command: 'rm -rf', nested: { a: 1 } });
  assert.strictEqual(out.tool.length, 40);        // still capped
  assert.strictEqual(out.ok, true);
  assert.ok(!('command' in out), 'still allowlist-only');
  assert.ok(!('nested' in out), 'objects still dropped');
  assert.strictEqual(sanitize('command', { name: 'a'.repeat(60) }).name.length, 40); // another event still capped
});

test('[AC-3] the feedback record dedup id IS the feedbackId → a resend is idempotent', () => {
  const env = { ts: '2026-07-04T00:00:00.000Z', userId: 'u', repoId: 'r', hv: '0.3.0' };
  const first  = buildFeedbackRecord({ type: 'bug', summary: 's', feedbackId: 'fb-7' }, { ...env, id: 'fb-7' });
  const resend = buildFeedbackRecord({ type: 'bug', summary: 's', feedbackId: 'fb-7' }, { ...env, id: 'fb-7' });
  assert.strictEqual(first.id, 'fb-7');           // record id == feedbackId (the Atlas dedup key)
  assert.strictEqual(resend.id, first.id);        // same submission → same id → server drops the duplicate
});

// MBI-113 (S2) — PHI-scan gate. `feedback` is the one INTENTIONAL free-text channel, so BEFORE it is
// persisted or queued the text is scanned; a PHI/PII/secret hit BLOCKS the write (nothing lands locally or in
// the upload queue) and returns a PHI-free result (hit count/classes, never the matched text). Clean passes.
const { feedbackRedactionHits, feedbackBlockMessage, appendFeedback } = require('../bin/usage-log.js');
const os2 = require('node:os'), fs2 = require('node:fs'), path2 = require('node:path');
const HIPAA_CFG = { classes: ['phi', 'pii', 'secrets'], allow: [], deny: [] };
// synthetic fixtures split so the SOURCE never carries a detectable pattern (redaction-scan won't self-flag);
// concatenated at runtime they ARE the full pattern feedbackRedactionHits must catch.
const FAKE_AWS_KEY = 'AKIA' + 'IOSFODNN7EXAMPLE';   // AWS docs example key (synthetic)
const FAKE_SSN = '123-' + '45-' + '6789';           // synthetic SSN

test('[AC-1] feedbackRedactionHits flags a secret/PII pattern in the free-text fields; clean text has none', () => {
  const hits = feedbackRedactionHits({ type: 'bug', summary: `creds ${FAKE_AWS_KEY} leaked`, detail: 'ok' }, HIPAA_CFG);
  assert.ok(hits.length >= 1 && hits.some((h) => h.class === 'secrets'), 'a secret in the summary is detected');
  assert.deepStrictEqual(feedbackRedactionHits({ summary: 'the sprint popup re-asked me', detail: 'minor nit' }, HIPAA_CFG), []);
});

test('[AC-1] the blocked result is PHI-safe — reports the count + classes, NEVER the matched snippet (safe-logging)', () => {
  const hits = feedbackRedactionHits({ type: 'bug', summary: `patient SSN ${FAKE_SSN}` }, HIPAA_CFG);
  const out = feedbackBlockMessage(hits);
  assert.strictEqual(out.blocked, true);
  assert.ok(out.redactionHits >= 1);
  assert.deepStrictEqual(out.classes, ['pii']);
  assert.ok(!out.message.includes(FAKE_SSN), 'the user-facing message must NOT echo the PHI value');
  assert.ok(out.message.includes('pii'), 'the class name is safe to surface');
});

test('[AC-1] appendFeedback BLOCKS a PHI/secret payload — nothing written locally or queued', () => {
  const home = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'hh-s2-'));
  const oldHome = process.env.HOME; process.env.HOME = home;
  try {
    const res = appendFeedback({ type: 'bug', summary: `SSN ${FAKE_SSN} in the trace`, detail: 'x', feedbackId: 'fb-blk' }, { cfg: HIPAA_CFG });
    assert.strictEqual(res.ok, false);
    assert.strictEqual(res.blocked, true);
    assert.ok(res.hits.length >= 1);
    const dir = path2.join(home, '.health-harness', 'usage');
    const files = fs2.existsSync(dir) ? fs2.readdirSync(dir).filter((f) => f.endsWith('.jsonl')) : [];
    assert.strictEqual(files.length, 0, 'blocked feedback must not be written to disk (not queued for upload)');
  } finally { process.env.HOME = oldHome; }
});

test('[AC-2] appendFeedback PASSES clean text — the record is written and returned', () => {
  const home = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'hh-s2ok-'));
  const oldHome = process.env.HOME; process.env.HOME = home;
  try {
    const res = appendFeedback({ type: 'idea', summary: 'add a dark mode toggle', detail: 'nice to have', feedbackId: 'fb-ok' }, { cfg: HIPAA_CFG });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.record.event, 'feedback');
    assert.strictEqual(res.record.id, 'fb-ok');
    const dir = path2.join(home, '.health-harness', 'usage');
    const lines = fs2.readFileSync(path2.join(dir, fs2.readdirSync(dir).find((f) => f.endsWith('.jsonl'))), 'utf8').trim().split('\n');
    assert.strictEqual(lines.length, 1, 'clean feedback is persisted');
  } finally { process.env.HOME = oldHome; }
});

// MBI-116 (S5) — /harness-feedback command. To reflect back "the exact enriched payload that WOULD be stored"
// without storing anything, previewFeedback builds the scanned+enriched record but writes NOTHING. The skill
// previews (reflect back) → gets consent (agree / edit / anonymous / cancel) → only THEN emit-feedback writes +
// usage-upload flush --force delivers. Nothing is stored or sent until the dev agrees.
const { previewFeedback } = require('../bin/usage-log.js');

test('[AC-1] previewFeedback builds the exact enriched payload but writes NOTHING (reflect-back, no store)', () => {
  const home = fs2.mkdtempSync(path2.join(os2.tmpdir(), 'hh-s5-'));
  const oldHome = process.env.HOME; process.env.HOME = home;
  try {
    const res = previewFeedback({ type: 'idea', summary: 'add dark mode', feedbackId: 'fb-prev' }, { cfg: HIPAA_CFG });
    assert.strictEqual(res.ok, true);
    assert.strictEqual(res.record.event, 'feedback');
    assert.strictEqual(res.record.id, 'fb-prev');
    assert.strictEqual(res.record.type, 'idea');
    assert.ok('platform' in res.record, 'the preview IS the enriched payload');
    const dir = path2.join(home, '.health-harness', 'usage');   // nothing persisted — reflect-back must not store
    assert.ok(!fs2.existsSync(dir) || fs2.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).length === 0, 'preview writes no record');
  } finally { process.env.HOME = oldHome; }
});

test('[AC-1] previewFeedback blocks a PHI payload too — the dev sees the block before consent', () => {
  const res = previewFeedback({ type: 'bug', summary: `SSN ${FAKE_SSN}` }, { cfg: HIPAA_CFG });
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.blocked, true);
  assert.ok(res.hits.length >= 1);
});

test('[AC-1] the /harness-feedback skill wires preview → consent → emit + force-deliver, with the consent gate', () => {
  const src = fs2.readFileSync(path2.join(__dirname, '..', 'skills', 'harness-feedback', 'SKILL.md'), 'utf8');
  assert.match(src, /^---[\s\S]*name:\s*harness-feedback[\s\S]*?---/, 'valid skill frontmatter registers the command');
  assert.match(src, /preview-feedback/, 'reflects back via preview (build without store)');
  assert.match(src, /emit-feedback/, 'writes via emit-feedback only after consent');
  assert.match(src, /flush\s+--force/, 'delivers via the forced flush');
  assert.match(src, /anonymous/i, 'offers anonymous mode');
  assert.match(src, /cancel/i, 'offers cancel');
  assert.match(src, /nothing is (stored|sent|stored or sent)/i, 'states the nothing-until-consent guarantee');
});

// MBI-114 (S3) — enrichment + graceful degradation. A feedback record is auto-populated with context:
// tool-derived fields (git name, branch-derived ticket, branch kind, platform) get filled from the env;
// agent-supplied fields (accountId, ccVersion, model, sessionId, command, phase) ride the payload and are
// simply kept when present / omitted when absent — never an error. Anonymous mode drops all identity fields.
const { enrichFeedback } = require('../bin/usage-log.js');

test('[AC-1] enrichFeedback auto-fills the tool-derived context fields onto the record', () => {
  const enriched = enrichFeedback({ type: 'bug', summary: 's' },
    { userName: 'Dev Example', issueKey: 'MBI-114', branchKind: 'feature', platform: 'linux' });
  const rec = buildFeedbackRecord(enriched, { id: 'fb-e', ts: '2026-07-04T00:00:00.000Z', userId: 'dev@mb', repoId: 'mb-harness', hv: '0.3.0' });
  assert.strictEqual(rec.userName, 'Dev Example');   // git name auto-filled
  assert.strictEqual(rec.issueKey, 'MBI-114');       // branch-derived ticket
  assert.strictEqual(rec.branchKind, 'feature');
  assert.strictEqual(rec.platform, 'linux');
  // the S1 env stamps are still present alongside the new context
  assert.strictEqual(rec.userId, 'dev@mb');
  assert.strictEqual(rec.repoId, 'mb-harness');
  assert.strictEqual(rec.hv, '0.3.0');
});

test('[AC-2] agent-supplied fields are kept when present, omitted (not errored) when absent', () => {
  const withRuntime = enrichFeedback(
    { type: 'idea', summary: 's', accountId: 'acc-1', ccVersion: '1.2.3', model: 'claude-opus-4-8', sessionId: 'sess-9', command: 'tdd', phase: 'build' },
    { platform: 'darwin' });
  const rec = buildFeedbackRecord(withRuntime, { id: 'fb-r', ts: 'T', userId: 'u', repoId: 'r', hv: 'v' });
  for (const [k, v] of Object.entries({ accountId: 'acc-1', ccVersion: '1.2.3', model: 'claude-opus-4-8', sessionId: 'sess-9', command: 'tdd', phase: 'build' }))
    assert.strictEqual(rec[k], v, `${k} kept when present`);
  // none resolvable → the record still builds, the fields are simply absent (no error, no null noise)
  const bare = buildFeedbackRecord(enrichFeedback({ type: 'bug', summary: 's' }, {}), { id: 'fb-b', ts: 'T', userId: 'u', repoId: 'r', hv: 'v' });
  assert.strictEqual(bare.event, 'feedback');
  for (const k of ['accountId', 'ccVersion', 'model', 'sessionId', 'command', 'phase', 'userName', 'issueKey'])
    assert.ok(!(k in bare), `${k} omitted when unavailable`);
});

test('[AC-2] anonymous mode drops all identity fields (git name + email + Jira account)', () => {
  const enriched = enrichFeedback({ type: 'friction', summary: 's', anonymous: true, accountId: 'acc-1' },
    { userName: 'Dev Example', platform: 'linux' });
  const rec = buildFeedbackRecord(enriched, { id: 'fb-a', ts: 'T', userId: null, repoId: 'r', hv: 'v' }); // caller nulls userId under anon
  assert.ok(!('userName' in rec), 'git name dropped');
  assert.ok(!('accountId' in rec), 'Jira account dropped');
  assert.strictEqual(rec.userId, null, 'git email dropped');
  assert.strictEqual(rec.anonymous, true, 'record marked anonymous');
  assert.strictEqual(rec.platform, 'linux', 'non-identity context still present');
});

test('MBI-46: transitionsFromIssue maps a real getJiraIssue(expand=changelog) shape via the category map', () => {
  const issueResp = { key: 'MBI-43', changelog: { histories: [
    { created: 't1', items: [{ field: 'status', from: '10225', fromString: 'Idea', to: '10227', toString: 'In Progress' }] },
    { created: 't2', items: [{ field: 'status', from: '10227', fromString: 'In Progress', to: '10261', toString: 'IN REVIEW' }] },
    { created: 't3', items: [
      { field: 'resolution', from: null, to: '10000' },
      { field: 'status', from: '10261', fromString: 'IN REVIEW', to: '10228', toString: 'Done' }] },
  ] } };
  const map = { '10225': 'new', '10227': 'indeterminate', '10261': 'indeterminate', '10228': 'done' };
  const evs = transitionsFromIssue(issueResp, map);
  assert.strictEqual(evs.length, 3); // resolution item ignored
  assert.deepStrictEqual(evs[0], { issueKey: 'MBI-43', fromStatus: 'Idea', toStatus: 'In Progress', fromCat: 'new', toCat: 'indeterminate', at: 't1' });
  assert.deepStrictEqual(evs[2], { issueKey: 'MBI-43', fromStatus: 'IN REVIEW', toStatus: 'Done', fromCat: 'indeterminate', toCat: 'done', at: 't3' });
  // a status not yet in the map → 'unknown' (custom-status-safe), and no issue/changelog → [] (never throws)
  assert.strictEqual(transitionsFromIssue(issueResp, {})[0].fromCat, 'unknown');
  assert.deepStrictEqual(transitionsFromIssue(null, map), []);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const N = require('../bin/issue-switch-nudge.js');

test('contextTokens: sums input + cache reads + cache creation (output excluded)', () => {
  assert.strictEqual(N.contextTokens({ input_tokens: 100, cache_read_input_tokens: 5000, cache_creation_input_tokens: 200, output_tokens: 999 }), 5300);
  assert.strictEqual(N.contextTokens(undefined), 0);
});

test('tokenBucket: coarse buckets only (no raw number leaves the machine)', () => {
  assert.strictEqual(N.tokenBucket(10000), 's');
  assert.strictEqual(N.tokenBucket(40000), 'm');
  assert.strictEqual(N.tokenBucket(90000), 'l');
  assert.strictEqual(N.tokenBucket(150000), 'xl');
});

test('tokensFromTranscriptText: returns the LAST usage-bearing line', () => {
  const txt = [
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 1, cache_read_input_tokens: 1000 } } }),
    JSON.stringify({ type: 'user' }),
    JSON.stringify({ type: 'assistant', message: { usage: { input_tokens: 2, cache_read_input_tokens: 110000 } } }),
    '', // trailing partial line tolerated
  ].join('\n');
  assert.strictEqual(N.tokensFromTranscriptText(txt), 110002);
  assert.strictEqual(N.tokensFromTranscriptText('not json\n{broken'), 0);
});

test('nudgeMessage: names both tickets and the rounded size, for a local-only reminder', () => {
  const m = N.nudgeMessage('ABC-1', 'XYZ-9', 111500);
  assert.ok(m.includes('ABC-1') && m.includes('XYZ-9') && m.includes('112k'));
});

test('evaluate: silent on no-key / same-anchor; nudges only on a NEW key over the size threshold', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-nudge-'));
  const prevHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const transcript = path.join(home, 't.jsonl');
    const writeCtx = (toks) => fs.writeFileSync(transcript, JSON.stringify({ message: { usage: { cache_read_input_tokens: toks } } }) + '\n');
    const sid = 'sess-1';

    // no issue key → null (the common, near-free path)
    assert.strictEqual(N.evaluate({ prompt: 'fix the failing test', sessionId: sid, transcriptPath: transcript }), null);
    // first ticket → becomes the anchor, no nudge
    assert.strictEqual(N.evaluate({ prompt: 'start ABC-100', sessionId: sid, transcriptPath: transcript }), null);
    // same ticket again → continuing, null (and must NOT need the transcript)
    assert.strictEqual(N.evaluate({ prompt: 'more on ABC-100', sessionId: sid, transcriptPath: transcript }), null);

    // different ticket, but the session is still small → no nudge
    writeCtx(10000);
    assert.strictEqual(N.evaluate({ prompt: 'now ABC-200', sessionId: sid, transcriptPath: transcript }), null);

    // a third ticket on a heavy session → nudge fires (names the anchor + the new key)
    writeCtx(120000);
    const msg = N.evaluate({ prompt: 'switching to ABC-300', sessionId: sid, transcriptPath: transcript });
    assert.ok(msg && msg.includes('ABC-100') && msg.includes('ABC-300'));

    // ...and it fires at most once per ticket (second mention is silent)
    assert.strictEqual(N.evaluate({ prompt: 'ABC-300 again', sessionId: sid, transcriptPath: transcript }), null);

    // a telemetry event was recorded (metadata only)
    const usageFiles = fs.readdirSync(path.join(home, '.health-harness', 'usage')).filter((f) => f.endsWith('.jsonl'));
    const lines = usageFiles.flatMap((f) => fs.readFileSync(path.join(home, '.health-harness', 'usage', f), 'utf8').trim().split('\n'));
    const switches = lines.map((l) => JSON.parse(l)).filter((r) => r.event === 'issue_switch');
    assert.strictEqual(switches.length, 2);                 // the two distinct switches (ABC-200, ABC-300)
    assert.deepStrictEqual(switches.map((s) => s.nudged), [false, true]);
    assert.ok(switches.every((s) => !('issueKey' in s)));   // raw ticket keys never uploaded
  } finally {
    process.env.HOME = prevHome;
  }
});

test('evaluate: a RELATED switch (sibling subtask) stays silent even on a heavy session; UNRELATED nudges with rationale', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-nudge-rel-'));
  const prevHome = process.env.HOME;
  process.env.HOME = home;
  try {
    const graph = { 'ABC-258': { parent: null }, 'ABC-259': { parent: 'ABC-258' }, 'ABC-260': { parent: 'ABC-258' } };
    const sid = 'rel-1';
    // anchor on ABC-259 (a subtask)
    assert.strictEqual(N.evaluate({ prompt: 'start ABC-259', sessionId: sid, graph, tokens: 200000 }), null);
    // → its sibling ABC-260 on a HEAVY session → context HELPS → stay silent (the false-positive we fixed)
    assert.strictEqual(N.evaluate({ prompt: 'now ABC-260', sessionId: sid, graph, tokens: 200000 }), null);
    // → an UNRELATED ticket on the same heavy session → nudge, and it explains WHY
    const msg = N.evaluate({ prompt: 'switching to XYZ-9', sessionId: sid, graph, tokens: 200000 });
    assert.ok(msg && /unrelated/i.test(msg) && msg.includes('XYZ-9') && /Why you're seeing this/.test(msg));

    // telemetry recorded the tier for each (related sibling = not nudged; unrelated = nudged)
    const usageDir = path.join(home, '.health-harness', 'usage');
    const lines = fs.readdirSync(usageDir).flatMap((f) => fs.readFileSync(path.join(usageDir, f), 'utf8').trim().split('\n'));
    const sw = lines.map((l) => JSON.parse(l)).filter((r) => r.event === 'issue_switch');
    assert.deepStrictEqual(sw.map((s) => [s.tier, s.nudged]), [['sibling', false], ['unrelated', true]]);
  } finally {
    process.env.HOME = prevHome;
  }
});

test('evaluate: HARNESS_ISSUE_NUDGE=off disables entirely', () => {
  const prev = process.env.HARNESS_ISSUE_NUDGE;
  process.env.HARNESS_ISSUE_NUDGE = 'off';
  try {
    assert.strictEqual(N.evaluate({ prompt: 'start ABC-1', sessionId: 's', transcriptPath: '/nope' }), null);
  } finally {
    if (prev === undefined) delete process.env.HARNESS_ISSUE_NUDGE; else process.env.HARNESS_ISSUE_NUDGE = prev;
  }
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { decideSound, classifyNotification, resolveMode, EVENTS } = require('../bin/play-sound.js');

const PHR = { waiting: 'Your turn.', gate: 'Approval needed.', done: 'Done.', subagent: 'Sub-task complete.' };
const base = {
  enabled: true,
  mode: 'voice',
  clip: { waiting: 'sounds/waiting.wav', gate: 'sounds/gate.wav', done: 'sounds/done.wav', subagent: 'sounds/subagent.wav' },
  tts: { available: true, phrase: PHR },
};
const withCfg = (over) => ({ ...base, ...over });

test('disabled → off (opt-in: silent by default)', () => {
  assert.strictEqual(decideSound('done', withCfg({ enabled: false })).action, 'off');
  assert.strictEqual(decideSound('done', null).action, 'off');
});

test('unknown event → off', () => {
  assert.strictEqual(decideSound('explode', base).action, 'off');
});

test('voice mode: bundled voice clip wins over live TTS (cross-platform, no install)', () => {
  const cfg = withCfg({ mode: 'voice', voiceClip: { done: 'sounds/voice/done.wav' } });
  const d = decideSound('done', cfg);
  assert.deepStrictEqual([d.action, d.target], ['clip', 'sounds/voice/done.wav']);
  // no voice clip for this event → live TTS
  assert.strictEqual(decideSound('gate', cfg).action, 'tts');
});

test('voice mode: spoken phrase wins, falls back to clip if no TTS', () => {
  let d = decideSound('done', withCfg({ mode: 'voice' }));
  assert.deepStrictEqual([d.action, d.target], ['tts', 'Done.']);
  // no TTS available (e.g. Linux without espeak) → falls back to the bundled chime, never silent
  d = decideSound('done', withCfg({ mode: 'voice', tts: { available: false, phrase: PHR } }));
  assert.deepStrictEqual([d.action, d.target], ['clip', 'sounds/done.wav']);
});

test('chime mode: clip wins, falls back to spoken if no clip', () => {
  let d = decideSound('done', withCfg({ mode: 'chime' }));
  assert.deepStrictEqual([d.action, d.target], ['clip', 'sounds/done.wav']);
  d = decideSound('done', withCfg({ mode: 'chime', clip: { ...base.clip, done: null } }));
  assert.deepStrictEqual([d.action, d.target], ['tts', 'Done.']);
});

test('nothing available → off', () => {
  const d = decideSound('done', withCfg({ clip: { ...base.clip, done: null }, tts: { available: false, phrase: {} } }));
  assert.strictEqual(d.action, 'off');
});

test('each event speaks its phrase in voice mode', () => {
  assert.strictEqual(decideSound('waiting', base).target, 'Your turn.');
  assert.strictEqual(decideSound('gate', base).target, 'Approval needed.');
  assert.strictEqual(decideSound('subagent', base).target, 'Sub-task complete.');
});

test('classifyNotification splits gate (approval) from waiting (attention)', () => {
  assert.strictEqual(classifyNotification('Claude needs your permission to run git push'), 'gate');
  assert.strictEqual(classifyNotification('approval needed'), 'gate');
  assert.strictEqual(classifyNotification('blocked: force-push'), 'gate');
  assert.strictEqual(classifyNotification('Claude is waiting for your input'), 'waiting');
  assert.strictEqual(classifyNotification(''), 'waiting');
});

test('resolveMode: ON by default in voice mode; env disables/overrides config', () => {
  // default: nothing set → ON, voice
  assert.deepStrictEqual(resolveMode(undefined, undefined), { enabled: true, mode: 'voice' });
  assert.deepStrictEqual(resolveMode(undefined, {}), { enabled: true, mode: 'voice' });
  // disable via env (all forms)
  for (const v of ['off', '0', 'false', 'no', '']) {
    assert.strictEqual(resolveMode(v, {}).enabled, false, `env ${JSON.stringify(v)} should disable`);
  }
  // mode via env
  assert.deepStrictEqual(resolveMode('chime', {}), { enabled: true, mode: 'chime' });
  assert.deepStrictEqual(resolveMode('voice', {}), { enabled: true, mode: 'voice' });
  assert.deepStrictEqual(resolveMode('1', {}), { enabled: true, mode: 'voice' });
  // config can disable team-wide when no env
  assert.strictEqual(resolveMode(undefined, { enabled: false }).enabled, false);
  assert.deepStrictEqual(resolveMode(undefined, { enabled: true, mode: 'chime' }), { enabled: true, mode: 'chime' });
  // env wins over config
  assert.strictEqual(resolveMode('off', { enabled: true }).enabled, false);
  assert.strictEqual(resolveMode('voice', { enabled: false }).enabled, true);
});

test('EVENTS is the canonical set', () => {
  assert.deepStrictEqual(EVENTS, ['waiting', 'gate', 'done', 'subagent']);
});

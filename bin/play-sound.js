#!/usr/bin/env node
/**
 * play-sound.js — optional MB audio cues for harness lifecycle events.
 *
 * Wired from hooks.json: Notification (Claude waiting / the wall asking), Stop (task done),
 * SubagentStop (a sub-agent finished). Maps an event → a sound and plays it.
 *
 * ON BY DEFAULT (voice mode). Disable per-person with `MB_HARNESS_SOUNDS=off` (env wins over config), or
 * team-wide with `.health-harness/sounds.json` `{ "enabled": false }`. `MB_HARNESS_SOUNDS=chime` swaps
 * voice for tones. Never blocks, never throws — fire-and-forget, always exits 0, can't disrupt a session.
 *
 * Resolution per event (first that's available wins): MB clip → gentle OS system sound → spoken phrase.
 * Healthcare-appropriate: defaults are soft cues, NOT clinical-alarm tones.
 *
 * Usage (from hooks):  node bin/play-sound.js notification|done|subagent   (notification reads stdin)
 */
'use strict';

const EVENTS = ['waiting', 'gate', 'done', 'subagent'];

// Which events make a sound by default. The Notification hook also fires on idle / auth pings
// (`idle_prompt`, `auth_success`) which classify as 'waiting' — those feel random ("your turn" with
// nothing there), and "Claude finished → your turn" is already covered by the Stop → 'done' cue. So
// 'waiting' is OFF by default; re-enable per-user with sounds.json `{ "events": { "waiting": true } }`.
const DEFAULT_EVENT_ON = { waiting: false, gate: true, done: true, subagent: true };

// A Notification fires for permission prompts AND idle/auth/elicitation pings. Classify by the message:
// approval/permission/elicitation → 'gate' (a real ask); everything else (idle, auth, attention) →
// 'waiting' (muted by default).
function classifyNotification(message) {
  const m = String(message || '').toLowerCase();
  if (/\b(approv|permission|permit|allow|grant|confirm|deny|denied|block|wall|outward|elicit)/.test(m)) return 'gate';
  return 'waiting';
}

/**
 * Pure decision: given an event + capability config, what do we play?
 * cfg = { enabled, mode:'chime'|'voice', voiceClip:{event:path|null}, clip:{event:path|null},
 *         tts:{available, phrase:{event:text}} }
 * - voice mode: bundled VOICE clip → live spoken TTS → (fallback) chime clip → off.
 * - chime mode (default): chime clip → (fallback) spoken TTS → off.
 * Returns { action:'clip'|'tts'|'off', target?, reason? }.
 */
function decideSound(event, cfg) {
  if (!cfg || !cfg.enabled) return { action: 'off', reason: 'disabled' };
  if (!EVENTS.includes(event)) return { action: 'off', reason: 'unknown-event' };
  if (cfg.events && cfg.events[event] === false) return { action: 'off', reason: 'event-muted' };
  const asClip = (p) => (p ? { action: 'clip', target: p } : null);
  const voiceRes = asClip(cfg.voiceClip && cfg.voiceClip[event]);
  const chimeRes = asClip(cfg.clip && cfg.clip[event]);
  const ttsRes = cfg.tts && cfg.tts.available
    ? { action: 'tts', target: (cfg.tts.phrase && cfg.tts.phrase[event]) || event }
    : null;
  const order = cfg.mode === 'voice' ? [voiceRes, ttsRes, chimeRes] : [chimeRes, ttsRes];
  return order.find(Boolean) || { action: 'off', reason: 'no-output' };
}

/**
 * Pure: resolve enabled + mode from the env flag and an optional config object.
 * Default is ON in voice mode. Env wins over config; `off`/`0`/`false`/`no`/empty disables.
 * Returns { enabled, mode:'voice'|'chime' }.
 */
function resolveMode(envFlag, fileCfg) {
  const cfg = fileCfg || {};
  let enabled, mode;
  if (envFlag !== undefined && envFlag !== null) {
    const norm = String(envFlag).trim().toLowerCase();
    if (/^(0|false|off|no|)$/.test(norm)) return { enabled: false, mode: 'voice' };
    enabled = true;
    if (norm === 'voice' || norm === 'chime') mode = norm;
  } else {
    enabled = cfg.enabled !== undefined ? !!cfg.enabled : true; // default ON
  }
  return { enabled, mode: mode || (cfg.mode === 'chime' ? 'chime' : 'voice') }; // default voice
}

module.exports = { decideSound, classifyNotification, resolveMode, EVENTS, DEFAULT_EVENT_ON };

// ── CLI / hook entry ────────────────────────────────────────────────────────────
if (require.main === module) {
  const run = () => {
    try { main(); } catch { /* never disrupt the session */ }
    process.exit(0);
  };
  // notification needs the stdin message to split waiting vs gate; others don't
  const arg = process.argv[2] || 'waiting';
  if (arg === 'notification') {
    let raw = '';
    process.stdin.on('data', (c) => { raw += c; });
    process.stdin.on('end', () => { process._mbEvent = classifyFromRaw(raw); run(); });
    // stdin may never arrive; don't hang
    setTimeout(() => { if (process._mbEvent === undefined) { process._mbEvent = 'waiting'; run(); } }, 400);
  } else {
    process._mbEvent = arg === 'done' || arg === 'subagent' ? arg : (EVENTS.includes(arg) ? arg : 'waiting');
    run();
  }
}

function classifyFromRaw(raw) {
  try { return classifyNotification((JSON.parse(raw || '{}').message) || raw); }
  catch { return classifyNotification(raw); }
}

function main() {
  const fs = require('fs');
  const path = require('path');
  const os = require('os');
  const { spawn } = require('child_process');

  const event = process._mbEvent || 'waiting';
  const platform = process.platform;
  const pluginRoot = path.join(__dirname, '..');

  // ── config / opt-in + mode ──
  // MB_HARNESS_SOUNDS: off|0|false → off · voice → spoken · chime → tones · 1|on|true → on (default mode).
  let fileCfg = {};
  try { fileCfg = JSON.parse(fs.readFileSync(path.join(process.cwd(), '.health-harness', 'sounds.json'), 'utf8')); } catch { /* none */ }
  const { enabled, mode } = resolveMode(process.env.MB_HARNESS_SOUNDS, fileCfg);

  // ── clip lookup: user override path, else a bundled file under sounds/[subdir/]<event>.(wav|aiff|mp3) ──
  const exists = (p) => { try { return p && fs.existsSync(p) ? p : null; } catch { return null; } };
  const findIn = (ev, subdir, overrideMap) => {
    const override = overrideMap && overrideMap[ev];
    if (override) return exists(path.isAbsolute(override) ? override : path.join(process.cwd(), override));
    for (const ext of ['wav', 'aiff', 'mp3']) {
      const p = path.join(pluginRoot, 'sounds', subdir, `${ev}.${ext}`);
      if (exists(p)) return p;
    }
    return null;
  };
  const findClip = (ev) => findIn(ev, '', fileCfg.clips);            // chimes: sounds/<event>.wav
  const findVoiceClip = (ev) => findIn(ev, 'voice', fileCfg.voiceClips); // voice: sounds/voice/<event>.wav

  const phrases = Object.assign(
    { waiting: 'Your turn.', gate: 'Approval needed.', done: 'Done.', subagent: 'Sub-task complete.' },
    fileCfg.phrases || {}
  );
  // Spoken voice: built-in on macOS (`say`) + Windows (PowerShell); Linux needs spd-say/espeak. If absent,
  // voice mode falls back to the bundled chime so it's never silent.
  const ttsCmd = fileCfg.ttsCmd; // e.g. a Piper pipeline or "espeak-ng -s 160" — overrides the OS default
  const ttsAvailable = (() => {
    if (ttsCmd || platform === 'darwin' || platform === 'win32') return true;
    try { require('child_process').execSync('command -v spd-say >/dev/null 2>&1 || command -v espeak-ng >/dev/null 2>&1 || command -v espeak >/dev/null 2>&1'); return true; }
    catch { return false; }
  })();

  const cfg = {
    enabled,
    mode,
    events: { ...DEFAULT_EVENT_ON, ...(fileCfg.events || {}) },
    voiceClip: Object.fromEntries(EVENTS.map((e) => [e, findVoiceClip(e)])),
    clip: Object.fromEntries(EVENTS.map((e) => [e, findClip(e)])),
    tts: { available: ttsAvailable, phrase: phrases },
  };

  const d = decideSound(event, cfg);
  if (d.action === 'off') return;

  // ── play, detached + best-effort; failures are silent ──
  const fire = (cmd, args) => {
    try { const c = spawn(cmd, args, { stdio: 'ignore', detached: true }); c.on('error', () => {}); c.unref(); } catch { /* silent */ }
  };
  if (d.action === 'clip') {
    if (platform === 'darwin') fire('afplay', [d.target]);
    else if (platform === 'win32') fire('powershell', ['-NoProfile', '-c', `(New-Object Media.SoundPlayer '${d.target}').PlaySync()`]);
    else fire('sh', ['-c', `paplay "${d.target}" 2>/dev/null || aplay "${d.target}" 2>/dev/null`]);
  } else if (d.action === 'tts') {
    const q = JSON.stringify(String(d.target)); // shell-safe quoting of the phrase
    if (ttsCmd) fire('sh', ['-c', `${ttsCmd} ${q} 2>/dev/null`]); // custom engine (e.g. Piper) wins
    else if (platform === 'darwin') fire('say', [d.target]);
    else if (platform === 'win32') fire('powershell', ['-NoProfile', '-c', `Add-Type -AssemblyName System.Speech; (New-Object System.Speech.Synthesis.SpeechSynthesizer).Speak('${d.target}')`]);
    else fire('sh', ['-c', `spd-say ${q} 2>/dev/null || espeak-ng ${q} 2>/dev/null || espeak ${q} 2>/dev/null`]);
  }
  void os;
}

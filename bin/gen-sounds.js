#!/usr/bin/env node
/**
 * gen-sounds.js — synthesize the default MB chime clips into sounds/*.wav.
 *
 * Run once (or to regenerate): `node bin/gen-sounds.js`. Produces small, soft, distinct chimes —
 * cross-platform 16-bit PCM WAV that plays identically on macOS / Windows / Ubuntu. These are the
 * DEFAULTS; replace any sounds/<event>.wav with a professionally-recorded MB clip anytime (same name).
 *
 * Deterministic (pure sine synthesis, no randomness) so regenerating yields identical files.
 * Healthcare-appropriate: gentle, short, not alarm-like.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const SR = 44100;

// one event = a sequence of {freq, dur} notes, each with a soft pluck envelope
const VOICES = {
  waiting:  { amp: 0.45, notes: [{ freq: 880.00, dur: 0.12 }, { freq: 1108.73, dur: 0.20 }] },          // A5→C#6 rising "your turn"
  gate:     { amp: 0.50, notes: [{ freq: 783.99, dur: 0.13 }, { freq: 523.25, dur: 0.24 }] },            // G5→C5 falling "checkpoint"
  done:     { amp: 0.45, notes: [{ freq: 523.25, dur: 0.10 }, { freq: 659.25, dur: 0.10 }, { freq: 783.99, dur: 0.24 }] }, // C-E-G success
  subagent: { amp: 0.38, notes: [{ freq: 1046.50, dur: 0.14 }] },                                        // C6 soft tick
};

function synth(voice) {
  const out = [];
  for (const { freq, dur } of voice.notes) {
    const N = Math.floor(SR * dur);
    for (let i = 0; i < N; i++) {
      const t = i / SR;
      const attack = Math.min(1, t / 0.006);      // 6ms attack (no click)
      const decay = Math.exp(-t * 7);             // plucked decay
      out.push(voice.amp * attack * decay * Math.sin(2 * Math.PI * freq * t));
    }
  }
  const fade = Math.floor(SR * 0.006);            // 6ms tail fade (no click)
  for (let i = 0; i < fade && i < out.length; i++) out[out.length - 1 - i] *= i / fade;
  return out;
}

function toWav(samples) {
  const n = samples.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);  // PCM
  buf.writeUInt16LE(1, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 2, 28); // mono, byte rate
  buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34);                          // block align, bits
  buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE((s * 32767) | 0, 44 + i * 2);
  }
  return buf;
}

module.exports = { synth, toWav, VOICES };

if (require.main === module) {
  const dir = path.join(__dirname, '..', 'sounds');
  fs.mkdirSync(dir, { recursive: true });
  for (const [event, voice] of Object.entries(VOICES)) {
    const file = path.join(dir, `${event}.wav`);
    fs.writeFileSync(file, toWav(synth(voice)));
    process.stdout.write(`wrote ${file}\n`);
  }
}

# MB sound cues

Spoken voice cues for harness lifecycle events. **ON by default** (voice mode).

## Turn it off / change it

```bash
export MB_HARNESS_SOUNDS=off      # disable (per person; env wins over any committed config)
export MB_HARNESS_SOUNDS=chime    # keep cues but use short tones instead of voice
export MB_HARNESS_SOUNDS=voice    # explicit voice (the default)
```
Team-wide off (committed): `.health-harness/sounds.json` → `{ "enabled": false }`.

> **Heads-up:** because it's on by default and the plugin installs into every repo, the IDE will *speak*
> (e.g. "Approval needed") — mind shared screens, meetings, and client demos. `MB_HARNESS_SOUNDS=off`
> silences it instantly for you.

## What plays, and when

`hooks.json` fires `bin/play-sound.js` on each event. **Default = spoken voice** (a short phrase);
**chime mode** plays a tone instead.

| Event | Hook | EPIC value | Spoken (voice mode) | Tone (chime mode) |
|---|---|---|---|---|
| **Claude waiting** for you | `Notification` | People | "Your turn." | rising chime |
| **Safety gate** — the wall asks/denies | `Notification` (approval msg) | Integrity | "Approval needed." | falling chime |
| **Task done** | `Stop` | Excellence | "Done." | success chime |
| **Sub-agent done** | `SubagentStop` | Customer | "Sub-task complete." | soft tick |

## Voice across platforms — bundled clips, no install

Voice mode plays **bundled spoken clips** in `sounds/voice/<event>.wav` via the OS audio player
(`afplay` / `aplay`/`paplay` / PowerShell). So **every OS — incl. Ubuntu — gets real spoken voice with
zero TTS install.** Resolution per event: **bundled voice clip → live TTS → chime → off.**

> The bundled `sounds/voice/*.wav` were generated with macOS `say` (Apple voice). To fully own the brand
> voice (and avoid shipping a vendor voice), **replace them with MB recordings** — see below. Delete a
> file to fall back to live TTS for that event.

### Optional: live TTS (only if you remove the bundled clips, or want a different voice)

macOS (`say`) and Windows (PowerShell) speak out of the box. On Linux, install one:

```bash
# Basic, tiny, ubiquitous (robotic but clear):
sudo apt-get install -y espeak-ng
# …or the speech-dispatcher route (gives `spd-say`):
sudo apt-get install -y speech-dispatcher
```

**Better, natural voice — [Piper](https://github.com/rhasspy/piper)** (open-source neural TTS, MIT).
Install it + a voice model, then point the harness at it in `.health-harness/sounds.json`:
```json
{ "enabled": true, "mode": "voice",
  "ttsCmd": "sh -c 'piper -m /path/en_US-amy-medium.onnx -f /tmp/mb.wav -- ; aplay /tmp/mb.wav' --" }
```
(`ttsCmd` receives the phrase as its last argument; it overrides the OS default on every platform.)

**Best & no-install — drop in recorded `.wav` clips** (below): then Ubuntu plays them via `paplay`/`aplay`
with **no TTS engine at all**, and everyone hears the same MB voice.

## The bundled chimes (`*.wav`)

`waiting.wav` / `gate.wav` / `done.wav` / `subagent.wav` are **generated** by `bin/gen-sounds.js`
(original, license-clean, cross-platform). They power chime mode and the voice-mode fallback. Regenerate
with `node bin/gen-sounds.js`.

## Use your own audio (branded voice or clips)

Drop a file named by event (`.wav` preferred) to override — it wins over both the generated chime and
TTS:
```
sounds/waiting.wav   sounds/gate.wav   sounds/done.wav   sounds/subagent.wav
```
For a **consistent MB voice**, record the phrases (or render them with an open TTS like Piper) to `.wav`
and drop them here — then everyone hears the same branded voice on every OS. Override paths/phrases per
event in `.health-harness/sounds.json`:
```json
{
  "enabled": true,
  "mode": "voice",
  "clips":   { "done": "assets/mb-done.wav" },
  "phrases": { "gate": "Mindbowser — your approval is needed." }
}
```

Healthcare-appropriate by design: cues are soft and brief — never clinical-alarm tones. The player never
blocks or errors a session; anything unavailable just stays silent.

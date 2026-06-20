# MB sound cues (optional)

Spoken voice cues for harness lifecycle events. **Off by default** — each person opts in.

## Turn it on (per person)

```bash
export MB_HARNESS_SOUNDS=voice    # spoken voice (default mode when you enable)
# or
export MB_HARNESS_SOUNDS=chime    # short tones instead of voice
export MB_HARNESS_SOUNDS=off      # disable
```
…or a local file `.health-harness/sounds.json`:
```json
{ "enabled": true, "mode": "voice" }
```

## What plays, and when

`hooks.json` fires `bin/play-sound.js` on each event. **Default = spoken voice** (a short phrase);
**chime mode** plays a tone instead.

| Event | Hook | EPIC value | Spoken (voice mode) | Tone (chime mode) |
|---|---|---|---|---|
| **Claude waiting** for you | `Notification` | People | "Your turn." | rising chime |
| **Safety gate** — the wall asks/denies | `Notification` (approval msg) | Integrity | "Approval needed." | falling chime |
| **Task done** | `Stop` | Excellence | "Done." | success chime |
| **Sub-agent done** | `SubagentStop` | Customer | "Sub-task complete." | soft tick |

## Voice across platforms

| OS | Voice | Notes |
|---|---|---|
| macOS | `say` | built-in, natural |
| Windows | PowerShell `SpeechSynthesizer` | built-in |
| Ubuntu/Linux | `spd-say` / `espeak` if installed | **else auto-falls back to the chime `.wav`** (never silent) |

So voice mode is safe everywhere: real speech where TTS exists, the bundled chime where it doesn't.

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

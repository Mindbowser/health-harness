---
name: harness-stats
description: Show YOUR own harness usage — a private /usage-style dashboard of activity, the coaching dimensions, trends, and a motivational summary. Read-only, metadata-only, no data leaves the machine.
disable-model-invocation: true
argument-hint: "(optional) number of days to cover — e.g. '30' (default 7)"
---

Your **personal** harness scoreboard. It reads the local, metadata-only usage log
(`~/.health-harness/usage/`) and renders a compact dashboard — activity, feedback-loop tightness,
align-before-code, small steps, prompt quality, critical engagement, and smart-zone — plus the same
motivational coaching summary you get each morning (wins, progress vs the prior period, one pointed
next lever toward becoming a 10x AI dev).

This is **information symmetry**: every engineer can see their own full data on demand. It's read-only,
nothing is uploaded by this command, and it never shows code, prompts, or file contents (only counts).

## What to do

Run the dashboard for the requested window (default 7 days; pass a day count as the argument), then
present the output to the user verbatim and offer to go deeper on any dimension:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/harness-stats.js" ${ARGUMENTS:-7}
```

- If the user passed a number (e.g. `/harness-stats 30`), use it as the window.
- After showing the dashboard, if a "🎯 Next lever" is present, offer one concrete way to act on it
  today (e.g. "want me to wire a one-command gate so it's easy to run after each change?").
- If the window is empty (a new install or a quiet stretch), say so plainly and point at `/start` or the
  Build Loop — don't fabricate numbers.

## Notes

- The metrics come from the harness hooks (PostToolUse, UserPromptSubmit, PreCompact, SubagentStop, the
  wall). See `README.md` → *Usage telemetry* and `docs/usage-coaching-prd.md` for the dimensions.
- Org-level rollups are a separate, consented feature (the telemetry uploader, default OFF) — this skill
  is only ever the individual's own view.

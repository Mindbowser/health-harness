# PRD — Usage analytics & next-day coaching ("become a 10x–100x Claude programmer")

> Destination doc for a harness feature. Status: **draft for alignment.** Built *through* the harness
> (this is the `/to-prd` output; sliced issues at the bottom are the `/to-issues` output).

## One-line goal
Turn each engineer's Claude usage into a **private daily coach** (and, org-consented, a **team dashboard**)
that moves people toward the first-principles habits of a 10x–100x AI-assisted programmer.

## Why
With AI, output is no longer gated by typing — it's gated by *habits*: tight feedback loops, alignment
before code, small verified steps, taste, and not fighting the model. People can't improve what they
can't see. The harness already intercepts these moments (the hooks + the wall), so it can mirror them
back as concrete, principle-based nudges — and, over time, show the org where the leverage (and the
friction) actually is.

## First principles → the north-star behaviors (what we coach toward)
1. **Tight feedback loops** — a one-command gate, run constantly.
2. **Align before code** — sharpen intent into a sliced spec before building.
3. **Small, reversible steps** — vertical slices, small commits.
4. **Verify, don't trust** — tests / run the app; AI output is a draft to prove.
5. **Stay in the smart zone** — small focused context; clear-and-reload over bloat.
6. **Don't fight the model** — stop-and-surface when stuck; never force green by cheating.
7. **Taste & judgment** — catch slop in review; know when it's done.
8. **Governance hygiene** — no PHI leaks, branch discipline, no force-push.
9. **Prompt with intent** — structured, context-rich asks (a sliced spec, not "make it work").
10. **Object to the output** — treat AI output as a *draft*: push back, correct, reject, redo. **Hard-harness
    the model — don't rubber-stamp it.** Blind acceptance is the #1 tell of a *1x* AI user.

## Goals / non-goals
**Goals:** private next-day coaching; metadata-only telemetry; an opt-in/consented org dashboard; a schema
that's dashboard-ready from day one.
**Non-goals:** logging code/prompts/PHI; a performance-ranking leaderboard; anything punitive; replacing
human judgment with a score.

## The two surfaces
- **Personal coach (always for the individual first).** On `SessionStart`, read *yesterday's* metrics and
  inject 2–3 coaching lines: *observed behavior → the principle → one concrete next action.*
  > "Yesterday: 18 edits, gate ran twice (1 fail) → tighten the loop, run the gate each change. 3
  > force-push attempts blocked → branch + PR. Strong: you `/align`ed before every build."
- **Org dashboard (consented).** Aggregate, **de-identified-by-default** trends: where the org is tight vs
  loose on each principle, friction hotspots, adoption of `/align`/`/tdd`, governance flags over time.

## Architecture
```
hooks (PreToolUse/PostToolUse/UserPromptExpansion/SessionStart/Stop/PreCompact)
   └─> bin/usage-log.js   → ~/.health-harness/usage/<date>.jsonl   (local, metadata only)
git activity (commits/branches/sizes) ───────────────┘
   └─> bin/usage-coach.js (SessionStart) → reads yesterday → injects coaching lines
   └─> bin/usage-upload.js (daily, consented) → POST metadata to the central store → dashboard
```
We control the schema via our own hook events (don't parse Claude Code's internal transcripts — unstable).

## Event schema (metadata only — dashboard-ready)
One JSON line per event. **No code, no prompt text, no file contents, no PHI.**
```json
{ "v": 1, "ts": "2026-06-20T10:12:04Z", "userId": "<git company email>", "repoId": "<hash>",
  "sessionId": "<id>", "event": "gate_run", "data": { "result": "pass", "ms": 4200 } }
```
Event types: `session_start` · `session_end` (duration) · `prompt` (count + length bucket + has-context
flags, **no text**) · `prompt_quality` (`{score, flags}` — local-scored, text never logged) · `command`
(`{name:"align"|"tdd"|...}`) · `edit` (`{ext}`) · `gate_run` (`{result, ms}`) · `tool_fail` ·
`user_reject` · `interrupt` · `revert` · `correction` · `wall` (`{action:"deny"|"ask", why}`) ·
`commit` (`{sizeBucket, branchKind}`) · `compaction` · `subagent`.

## Metrics (derived from events) → the coaching dimensions
| Dimension (principle) | Metric | Healthy direction |
|---|---|---|
| Feedback loop | edits per gate-run · gate pass-rate | low edits/run, high pass-rate |
| Align before code | % builds preceded by `/align` | high |
| Small steps | median commit size · commits/task | small |
| Verify not trust | % code changes with tests · `/tdd` use | high |
| Smart zone | session length · compactions/session | moderate / low |
| Don't fight it | thrash index (consecutive `tool_fail`) · forced-green attempts | low / zero |
| Governance | force-push & commit-on-base attempts · redaction hits | zero |
| **Prompt quality** | prompt-quality score (heuristic now; local judge later) · vague-prompt rework rate | high score, low rework |
| **Critical engagement (objecting)** | rejections · interrupts · reverts · corrections per AI change | active — *not* rubber-stamping |

### Measuring "right prompts" without reading prompts
- **Heuristic (metadata, ships first):** structured-ask signals — did they `/align` vs a raw one-liner ·
  prompt length bucket · context markers (file/ticket refs) · **rework after a prompt** (edits/fails that
  follow it = a vague ask). No content stored.
- **Local judge (optional, later):** a rubric scorer runs **on-device** against the prompt and logs **only
  the score/flags — the prompt text never leaves the machine.** This is how we get real prompt-quality
  signal while staying metadata-only.

### Measuring "objecting to the LLM" (hard-harnessing)
Critical engagement = the user treating output as a draft. Signals (all metadata): **user-rejected** tool
calls/permissions · **interrupts** (stop mid-stream) · **reverts/undo** of AI changes · **correction
turns** (re-prompt right after a diff) · review edits before accept. High = engaged; near-zero across a
day of heavy AI output = rubber-stamping → coach it.

## Identity, enforcement & governance — **hard requirements**
Per the org decision, telemetry is **identified, on by default, and enforced** (employees can't disable
it). That's a legitimate posture for **company-owned dev tooling** — *but only if done in the open.* These
are non-negotiable for it to be lawful (GDPR / employee-monitoring rules) and to keep trust:

1. **Identified by git company email** — the `user.email` from git config (org policy = company email in
   git, so it's the authoritative work identity, already present, no lookup needed). This is **distinct
   from the Claude-login email** (which may be personal — we never collect that). *(Fallback where git
   email isn't the company one: AD/system identity — OS user + machine name, resolved centrally via Fleet.)*
2. **Enforced, on by default.** Enabled via **managed settings** (highest precedence, deployed by
   MDM/FleetDM) so no user can turn it off — `usage.telemetry.enabled = true`, not user-overridable.
3. **Disclosed + policy-backed — REQUIRED before it ships.** A written monitoring policy + employee notice,
   a documented lawful basis, and in the EU/UK a **DPIA** (and works-council sign-off where applicable).
   Mandatory **covert** monitoring is not acceptable; **disclosed** company-tooling telemetry is. This is
   the line that keeps "on by default, can't disable, identified" both legal and trusted.
4. **Metadata only — still absolute.** Never code, prompts, file contents, or PHI. Prompt quality is
   scored **on-device**; only the score/flags leave. A field-allowlist enforces this in code + tests.
5. **Information symmetry.** Every employee can see their **own** full data (`/harness-stats`). Mandatory
   collection *with* personal visibility is the trust (and compliance) anchor.
6. **Non-punitive by policy.** For coaching + finding org friction — **not** ranking, PIPs, or firing.
   Stating this in the policy is also what stops people gaming it.
7. **Anti-Goodhart.** Coach on principles, never a single gameable score.

## Config
```json
// managed settings (enforced; user/project settings cannot override)
{ "usage": { "log": true, "coach": true,
             "telemetry": { "enabled": true, "endpoint": "https://…", "identify": "git-email" } } }
```
Deployed via MDM/FleetDM so it's **on by default and non-disableable**. `identify: "git-email"` tags
records with the git `user.email` (the company email; *not* the Claude-login email). Alternative:
`"system"` (OS user + machine name, AD-resolved centrally). The personal next-day coach runs from the same
local log. **Code still drops anything outside the metadata allowlist** regardless of config — not
configurable.

## Staged rollout (the `/to-issues` slices)
1. ✅ **Schema + logger** *(built v0.1.57; coverage completed v0.1.62)* — `bin/usage-log.js`: pure
   `eventsFromHook` + field allowlist (tested); writes metadata-only JSONL to `~/.health-harness/usage/`.
   **Wired hooks:** PostToolUse (`tool`/`edit`/`gate_run` + `commit` with `sizeBucket`/`branchKind` via
   `enrichCommit`, + `revert`), the wall (`wall`), SessionStart (`session_start`), **UserPromptSubmit**
   (`prompt` length-bucket + `hasContext`, + `command` for `/align`,`/tdd`,…), **PreCompact** (`compaction`),
   **SubagentStop** (`subagent`). *Not yet capturable (no clean Claude Code hook): `user_reject`,
   `interrupt` — and `correction` (re-prompt-after-edit) is derivable at summarize-time, not yet wired.*
2. ✅ **Next-day coach** *(built v0.1.57; dimensions extended v0.1.62)* — `bin/usage-coach.js`: pure cadence
   (`coachCadence` — **once a day**, **weekly on Monday**) + `summarize` + `buildCoaching`; runs from
   `SessionStart`. Coaches feedback-loop, align-before-code, objecting, governance, **prompt-quality
   (context-rich asks), small-steps (commits), and smart-zone (compactions)**. Tested.
3. ✅ **`/harness-stats` skill** *(built v0.1.62)* — `bin/harness-stats.js`: a private `/usage`-style
   dashboard (activity sparkline + every coaching dimension + the motivational summary with progress
   deltas). Read-only, metadata-only, on-demand; window defaults to 7 days. The daily coach was also made
   **motivational** (leads with wins, shows improvement vs the prior period, one pointed 10x-framed lever).
4. 🚧 **Telemetry uploader** — harness side **built v0.1.62, DEFAULT OFF**: `bin/usage-upload.js` runs on
   SessionStart (detached, throttled ~6h), backfills un-sent days + ships new bytes of the current day to
   `HARNESS_TELEMETRY_ENDPOINT` with a `Bearer HARNESS_TELEMETRY_TOKEN` (config via settings `env`; FleetDM
   later). Records carry git company email (`userId`) + harness version (`hv`). No endpoint set = no-op, so
   nothing leaves any machine. **Still TODO before enabling:** the MBI Atlas ingest endpoint
   (`POST /atlas/api/harness/usage` → append to per-user JSONL folders at
   `/home/ubuntu/.openclaw/shared/harness-telemetry/<email>/<date>.jsonl`, shared-token auth) **and** the
   **disclosure/policy (+ EU DPIA)**. Rollout: Pravin + CH team first, then gradually everyone.
5. **Dashboard** — central store + de-identified team views (separate service; schema already ready).

## Open questions
- `userId` = **git company email** (`user.email`) — already present, authoritative; *not* the Claude-login
  email. Fallback: AD/system (OS user + machine) where git email isn't the company one.
- The disclosure/policy + lawful basis (and EU DPIA / works-council) — **owner + timeline** before telemetry ships.
- Central store + dashboard tech (separate service — out of this repo's scope; this repo emits the data).
- Exact thresholds for "healthy" per metric — calibrate empirically (don't hardcode judgments).

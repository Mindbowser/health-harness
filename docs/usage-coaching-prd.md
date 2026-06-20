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
{ "v": 1, "ts": "2026-06-20T10:12:04Z", "userId": "<stable hash>", "repoId": "<hash>",
  "sessionId": "<id>", "event": "gate_run", "data": { "result": "pass", "ms": 4200 } }
```
Event types: `session_start` · `session_end` (duration) · `prompt` (count only) · `command`
(`{name:"align"|"tdd"|...}`) · `edit` (`{ext}`) · `gate_run` (`{result, ms}`) · `tool_fail` ·
`wall` (`{action:"deny"|"ask", why}`) · `commit` (`{sizeBucket, branchKind}`) · `compaction` · `subagent`.

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

## Privacy, consent & governance — **hard requirements (not optional)**
Because this monitors employees at a healthcare firm (employee-monitoring law + GDPR + trust):
1. **Metadata only.** Never log code, prompts, file contents, or PHI. The logger has an allowlist of
   fields; everything else is dropped.
2. **Transparent + consented.** Org tracking ships **only** with: a written policy, employee disclosure,
   and recorded consent. Enabled via **managed settings** (`usageTelemetry`), off until the org turns it on.
3. **Individual access.** A person can always see their *own* full data (`/harness-stats`) — symmetry of
   information is the trust anchor.
4. **De-identified aggregation by default.** Dashboard shows team/cohort trends; individual attribution is
   role-gated and policy-bound. **Never used punitively** (no firing/ranking) — it's coaching + finding
   org friction.
5. **Anti-Goodhart.** Coach on *principles*, not raw counts; don't surface a single "score" that people
   game (e.g. don't reward more commits). Review every metric for the perverse-incentive it could create.
6. **Right to pause/delete.** A user can pause local logging and purge their local logs.

## Config
```json
// ~/.health-harness or managed settings
{ "usage": { "log": true, "coach": true,
             "telemetry": { "enabled": false, "endpoint": "", "consentRecorded": false } } }
```
Personal coach works with just local logging on; **telemetry stays off until `enabled` + `consentRecorded`
are both true** (enforced in code, deployed via managed settings).

## Staged rollout (the `/to-issues` slices)
1. **Schema + logger** — `bin/usage-log.js` (pure event-builder + tested allowlist) + hook wiring; writes
   local JSONL. Metadata-only enforced + tested.
2. **Next-day coach** — `bin/usage-coach.js`; extend `SessionStart` to inject yesterday's principle-based
   lines. Pure metric + message builders, tested.
3. **`/harness-stats` skill** — show *your own* trends on demand.
4. **Telemetry uploader (consented)** — `bin/usage-upload.js`; daily metadata POST; gated on
   `enabled + consentRecorded`; managed-settings deployable (FleetDM).
5. **Dashboard** — central store + de-identified team views (separate service; schema already ready).

## Open questions
- Stable `userId` source (hash of git email? org SSO id?) — needs the consent/policy answer.
- Central store + dashboard tech (separate service — out of this repo's scope; this repo emits the data).
- Exact thresholds for "healthy" per metric — calibrate empirically (don't hardcode judgments).

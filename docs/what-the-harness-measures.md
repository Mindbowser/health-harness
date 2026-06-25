# What the harness measures (and what matters most)

> **One thesis:** *measure what **survives** — tested, verified, didn't bounce back — not what was typed.*
> Activity (lines, commits, hours) is cheap and misleading with AI. The harness measures **outcomes**:
> did the work ship fast, and did it **stay** good.

All of this is **metadata-only** (a write-time field allowlist drops everything else — no code, prompts,
file contents, paths-in-clear, or PHI ever leave) and **client-side** (no GitHub CI, no webhooks). It is
attributed **by ticket** (the branch-derived `issueKey`), reported as **noisy trends**, and **never** turned
into a per-person score. See the producer in `bin/usage-log.js` (the `ALLOW` allowlist is the privacy
contract) and the upload path in `bin/usage-upload.js`.

## Status today (2026-06-26) — read this first

A signal has **three layers**: (1) **parser built** → (2) **wired to emit** in real sessions → (3)
**consumed by an Atlas card**. MBI-23 delivered the parsers (layer 1) and wired *most* of layer 2 — but
**FASTER's emission is still unwired**, so it produces **no data today**, and the **Atlas FASTER/BETTER cards
(layer 3) are MBI-24 — not built yet**. Read the sections below as the **design + producer**, not as live
metrics. Honest status:

| Signal | Parser built | Emitting in sessions | On the dashboard |
|---|---|---|---|
| **FASTER** — `ticket_transition` | ✅ | ❌ **not wired** (no hook/skill calls the CLI) → no data | ❌ card empty ("needs Jira integration") |
| **BETTER** — commit `fp` + reopens | ✅ | `fp` ✅ emits · reopens need the (unwired) transition | ⚠️ a *tested×verified* proxy shows; rework/mutation enrichment pending |
| **Honest gate** — `gate_run:fail` | ✅ | ✅ (`PostToolUseFailure` hook) | ✅ feeds gate-pass / DONE-RIGHT |
| **Test strength** — mutation | ✅ | ⚠️ on-demand only (`npm run mutation:emit`) | ❌ not consumed yet |

**To make FASTER real, two pieces remain:** (a) **wire the emission** — the deferred MBI-44 follow-up: a
hook/skill that, on each Jira read, feeds the changelog into the `ticket-transitions` CLI (until this lands,
*nothing* is recorded); then (b) **MBI-24** computes the cycle-time card from the stream. BETTER's
rework/mutation enrichment is the same shape — the `fp` data already flows; MBI-24 must consume it.

## The four outcomes (design + signals)

### 1. FASTER — real cycle time
**What matters:** how long work actually takes — *and* not blaming the dev for queue time they don't control.

- **Signal:** the **`ticket_transition`** stream — every Jira status change `{issueKey, fromStatus,
  toStatus, fromCat, toCat, at}`, derived deterministically from the Jira changelog (no CI/webhook).
  **Status: parser built, emission NOT yet wired — no transitions are recorded today, so FASTER has no data**
  (see the table above).
- **Segmented, on purpose:** `In Progress → dev-handoff (In Review)` = **dev cycle time**; `→ Done` = **lead
  time**; the gap in review/QA is **QA-wait**, measured *separately*. So a QA environment stuck for a week
  never inflates a dev's speed number — and the QA-wait itself becomes a visible **process** bottleneck.
- **Custom workflows:** capture keeps the raw status label (custom statuses are never lost); `inferStageRoles`
  proposes stage roles and asks for a **one-time** confirmation on custom/ambiguous statuses, persisted to
  `project.json`.

### 2. BETTER — durable quality (did it *stay* done)
**What matters:** not "did tests pass once" but "did the shipped work survive, or did it bounce back."

- **Rework signal:** the **commit symbol fingerprint** (`commit.fp`/`fpConf`) — a one-way hash of the
  *enclosing function/symbol* of the dominant changed unit. Rework = **the same logical unit comes back**
  after merge, **not** "someone touched that file again." In-branch red-green-refactor churn is *healthy* and
  is **not** counted.
- **Escaped-defect signal:** a `Done → In Progress` transition in the same `ticket_transition` stream — the
  ticket reopened, i.e. it didn't stay done.

### 3. Honest gate — first-try quality
**What matters:** the gate signal must be *true*. Previously every gate run recorded `pass` (failures were
never captured), which silently faked "first-try quality."

- **Signal:** **`gate_run`** now records real `fail` (wired through Claude Code's `PostToolUseFailure`
  event), so a failing TDD red run is visible. Paired with the deterministic **`gate_evidence`** fingerprint,
  the wall also blocks a hallucinated "tests pass" at publish.

### 4. Test strength — are the tests meaningful
**What matters:** coverage says lines ran; **mutation score** says the tests would actually *catch* a bug.

- **Signal:** **`test_strength` (`kind=mutation`)**, emitted by the pluggable **`npm run mutation:emit`**
  runner — point it at any mutation tool's report/output (file or stdin); no bundled dependency, no hard CI
  dependency, graceful no-op when there's no score.

## Supporting signals (already shipped)
`test_change` (did the slice add tests), `gate_evidence` (verified/unverified at push), `commit`
(size/branch), `issue_meta` (the ticket's parent/epic/links + type/priority, captured at `/align`),
`issue_switch` (smart-zone nudge), `wall` (guardrail hits), `prompt`/`command` (align-before-code adoption).

## Producer → consumer
- **Producer = this plugin.** It emits the signals above to `~/.health-harness/usage/` and ships them to
  **MBI Atlas**. This is **MBI-23** (the four slices: `gate_run:fail`, commit fingerprint, `ticket_transition`
  stream, `mutation:emit`) — done.
- **Consumer = MBI Atlas (MBI-24).** The AI Usage dashboard turns these signals into the **FASTER / BETTER**
  cards. It lives in the **`mbi-atlas`** repo (separate from this one). These **deterministic, client-side
  signals supersede** the earlier git-churn heuristic in `docs/atlas-outcomes-pipeline-brief.md`.

## What this is *not*
- Not a per-person scoreboard. Attribution is by **ticket**, and the numbers are **trends**, not verdicts.
- Not activity tracking. No keystrokes, no time-at-keyboard surveillance, no code content.
- Not a gate you can game: green has to mean *the behavior works* (the wall enforces real gate evidence +
  redaction at egress).

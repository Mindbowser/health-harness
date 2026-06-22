# Brief for the Atlas agent — surface hygiene telemetry as ONE CTO number

Paste the block below to the **mbi-atlas** agent. The harness now emits best-practice/hygiene signals; surface
them **simply** — one number a CTO reads in 2 seconds, with the breakdown on drill-down. Non-punitive.

---

## PROMPT (copy from here)

The harness now emits **hygiene signals** as metadata-only telemetry (in the per-user JSONL you already
ingest). Surface them on the Harness AI Usage view as **ONE leading-indicator number**, not a cluster of
metrics — a CTO should grasp it instantly.

### The one number: "Hygiene gaps"
Add a single tile next to the existing KPIs (or as a sub-line under **Better**, since these *predict* rework):

> **Hygiene gaps: N** (trend vs prior period · target 0)

where **N = count over the window of**: `migration_gap` + `coverage_drop` + `dep_hygiene` + **unconfirmed**
`breaking_change` (i.e. `breaking_change` with `confirmed` != true). These are the "bites-you-later" items.
Lower is better; **0 is the goal**; show the trend arrow.

Position it as a **leading indicator of Better/Safer** — a rising hygiene-gap count predicts rework and
incidents before they show up in the outcome metrics.

### Drill-down (for leads, not the CTO top line)
On expand, show the breakdown — counts of: migration gaps, coverage drops, dependency flags, and breaking
changes (total + **% confirmed**, since the healthy signal is breaking changes *acknowledged with a compat
plan*, not zero). Optionally `test_strength` (latest mutation score / property-test presence) if any
`test_strength` events exist. Keep this behind the tile, not on the main scorecard.

### Event fields (code against these; all optional, metadata-only)
`migration_gap{reason}` · `coverage_drop{delta}` · `dep_hygiene{kind,count}` ·
`breaking_change{kind,confirmed,issueKey}` · `migration{pattern,issueKey}` · `test_strength{kind,score}`.

### Rules
- Aggregate in the existing background rollup (`buildHarnessRollup` ~2389); serve from cache; missing → "—"/0.
- **Non-punitive** — org/team level; if shown per-dev, use the existing health-table style (status + focus
  area), never a ranked hygiene score.
- Don't add a 5-metric "hygiene panel" to the top line — **one number + drill-down**. Resist card sprawl.

### Acceptance
- One "Hygiene gaps" number with trend on the scorecard; the 4-way breakdown only on drill-down; degrades to
  "—"/0 when no events; cached/async; reconciles with `bin/usage-coach.js summarize()`.

## END PROMPT

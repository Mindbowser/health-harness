# Brief for the Atlas agent — add a "Hygiene" strip to Harness AI Usage

Paste the block below to the **mbi-atlas** agent. The harness now emits best-practice/hygiene signals; this
surfaces them org-wide (non-punitive).

---

## PROMPT (copy from here)

The harness now emits **hygiene signals** as metadata-only telemetry events (in the same per-user JSONL you
already ingest). Add a small **"Hygiene" strip** to the Harness AI Usage view that aggregates them. Keep it
**non-punitive** (org/team trend + "where to help", never a per-person ranking).

### New event types in the telemetry (code against these; all optional, metadata-only)
- `breaking_change` — fields: `kind` (api|schema|event), `confirmed` (bool), `issueKey`. A change to an
  existing contract that `/align` flagged + the dev confirmed.
- `migration` — `pattern` (e.g. `expand-contract`), `issueKey`. A schema change done the safe way.
- `migration_gap` — `reason` (e.g. `no-migration-layer`). A repo has a DB but no migration tool.
- `coverage_drop` — `delta` (coverage points dropped).
- `dep_hygiene` — `kind` (stale|unpinned|major|vuln), `count`.
- `test_strength` — `kind` (mutation|property), `score`. **Captured cheaply** (CI mutation score POSTed in, or
  property-test presence) — do NOT expect one per build.

### What to show (org-wide, in the rollup `buildHarnessRollup()`; cache as today)
A compact **Hygiene** strip, each a count over the window + trend vs prior:
- **Migration gaps** (DBs with no migration layer) — target 0.
- **Coverage drops** — target 0.
- **Dependency flags** (stale/unpinned/major/vuln).
- **Breaking changes**: total, and **% confirmed** (confirmed=true ÷ all) — the healthy signal is that
  breaking changes are *acknowledged with a compat plan*, not zero breaking changes.
- **Test strength** (if any `test_strength` events): latest mutation score / property-test presence.

### Rules
- Aggregate in the existing background rollup (`buildHarnessRollup` ~2389); serve from cache; missing → "—".
- **Non-punitive:** org/team level; if you show per-dev, keep it in the existing health-table style (status,
  "focus area"), never a ranked hygiene score.
- These join the 5 KPIs as **leading indicators of the "Better/Safer" outcomes** — a hygiene gap predicts
  rework/incidents later.

### Acceptance
- Hygiene strip renders the counts + trend from the new events; degrades to "—" when absent; cached, async.

(Reference: `bin/usage-log.js` `ALLOW` for the exact fields; `bin/usage-coach.js` `summarize()` for how the
harness counts the same signals — match it so org and personal numbers reconcile.)

## END PROMPT

# Metric definitions — the correctness source of truth (SoT)

> **Why this exists.** The harness *produces* signals; **MBI Atlas** *computes* the cards. This file pins
> what each headline metric **means** and how it's computed so the numbers are correct and can't drift —
> the same role `sales-credit.js` plays for "what counts as a sale." Atlas implements its card math
> **against this file** and verifies with the named golden tests. Producer-side guards live in
> `test/metric-definitions.test.js`.
>
> **First-principles lens.** We measure whether people use the harness the way that compounds into long-run
> **productivity + quality** — **speed · betterment · safety**. **Not cost.** Always **by ticket**, always
> **trends**, **never a per-person score**.

Each metric below: **Definition · Window · Include/Exclude · The trap · Computed where · Guarded by.**

---

## FASTER — real cycle time
- **Definition.** Per ticket, `cycle = entry-to-`done`-category − entry-to-`indeterminate`-category` (work
  started → shipped), from the `ticket_transition` stream. Headline = **median** over the window.
- **Segmentation.** `dev-cycle` = start → review/QA **handoff** (a `toStatus` matching `/review|qa|uat|test/i`,
  or a `project.json` override); `QA-wait` = handoff → `done`. Report the split when a handoff is
  identifiable; else whole span = dev-cycle, QA-wait = n/a. Reuse the producer's `inferStageRoles` heuristic
  — do **not** write a second regex.
- **Window.** Tickets reaching `done` in the window (attribute the cycle to its done-date).
- **Include/Exclude.** Exclude bot tickets. A ticket with no `In Progress` (jumped straight to done) → no
  dev-cycle; count as data-quality, not a 0.
- **THE TRAP.** (1) **Reopens** — `Done → In Progress → Done` is **two cycles**; compute per ship edge, not
  first→last, or you under-count. (2) **QA-wait must be split out** or a stuck QA env inflates dev speed
  (the property we explicitly want). (3) Category alone can't tell review from active dev — both
  `indeterminate`; the **status name** is the signal (that's why the producer emits it).
- **Computed where.** Producer emits raw transitions (complete, deduped, ordered by `at`); **Atlas** derives
  the deltas + segmentation.
- **Guarded by.** `MBI-48 · FASTER: reopen → 2 ship edges + 1 reopen`; `… review handoff identifiable by name`;
  `… idempotence: dedupe by issueKey+at`.

## BETTER — durable quality (did it *stay* done)
- **Definition (target).** Post-merge **rework rate** = fraction of merged work whose **same logical unit**
  (commit `fp` — path+symbol hash) is re-touched after merge, **+ escaped defects** (`Done → In Progress`
  reopens). Lower is better; report as a **trend**.
- **Definition (current proxy, until rework lands in Atlas).** Per-ticket **tested × verified-at-ship** rate.
- **Window.** Rework: re-touch within ~14 days of merge. Reopen: any `done → indeterminate` in the window.
- **THE TRAP.** (1) **Never count in-branch red-green churn** — rework is **post-merge** re-touch only;
  counting pre-merge punishes good TDD (the exact behavior the harness promotes). (2) Same **logical unit**,
  not same file — a 2,000-line file touched twice for unrelated reasons is NOT rework (that's why `fp` is
  symbol-level). (3) **"tested" ≠ `hasTests`** — a slice can add a test file that doesn't cover the new
  behavior; trust `behaviorChangeNoTests` (source changed, no test change on the branch), not a green gate.
- **Computed where.** Producer emits `commit.fp`/`fpConf`, `ticket_transition` (reopens), `test_change`;
  **Atlas** computes rates per repo (**not per author** — avoid blame).
- **Guarded by.** `MBI-48 · BETTER: source-only diff flags behaviorChangeNoTests`; reopen edge (above).

## SAFER — guardrails held
- **Definition.** Egress **leaks = redaction DENYs at the wall** (PHI/PII/secret blocked leaving the repo).
  Plus wall catches (catastrophic/outward asks). "0 leaks" is the healthy state.
- **THE TRAP.** **"0 leaks" must mean "0 DENYs *and* scans ran"**, not "the scanner never ran." Distinguish
  *blocked* (`wall.action='deny'`, redaction reason) from *clean scan* (`redaction` event, `hits=0`) from
  *not-checked* (neither). A silent absence is not safety.
- **Computed where.** Producer emits `redaction` (hits) + `wall` (action/why); **Atlas** counts DENYs and
  surfaces scan coverage.

## DONE-RIGHT — process discipline
- **Definition.** Gate-pass rate (`gate_run` pass vs fail per ticket) × **align-first** rate (align happened
  **before** the first edit/commit on the ticket).
- **THE TRAP.** **align-first = align *before* first build action on that ticket** — not "an `align` event
  exists somewhere for the ticket." Order matters; use event timestamps + `issueKey`. And gate-pass must use
  **real** `gate_run` results (failures are captured since `gate_run:fail` was wired — don't assume all-pass).
- **Computed where.** Producer emits `command(align)`, `gate_run`, `commit`, `edit` with `ts` + `issueKey`;
  **Atlas** orders them per ticket.

## ADOPTED — rollout reaching people
- **Definition.** % of active devs using the harness, and % **on latest**.
- **THE TRAP.** **"on latest" needs a live latest-version reference** — comparing each dev's `hv` to a
  hardcoded or stale "latest" makes a drifted `0.1.x` machine read as adopted-and-current. Resolve "latest"
  from the marketplace at compute time.
- **Computed where.** Producer stamps `hv`/`userId` on every event; **Atlas** compares to live latest.

---

## Rules that apply to every metric
- **By ticket, not session** (sessions churn for context hygiene — wrong denominator). **Never per-person.**
- **Trends, not verdicts** — noisy signals; show direction, not a grade.
- **Graceful empty** — a card with no data shows `—`, never a fake 0 or a stale number.
- **Metadata only** — every input is an allowlisted scalar; no code/paths/PHI (see `what-the-harness-measures.md`).
- **Drill-down + project-wise reports** are later slices — they are *views* of these same definitions, so
  getting the definitions right here makes them free.

---
name: tdd
description: Test-driven development using red-green-refactor cycles — the way AFK build work is done.
---

Implement a vertical slice with **test-driven development**: write a failing test, make it pass with
minimal code, refactor. This is how all AFK (away-from-keyboard) build work is done in the Build Loop.
TDD is mandatory here — it stops the agent from faking tests, and good tests are the feedback loop that
caps how well the agent can code.

This skill is the harness's **fundamentals in practice** — the same ones AI speed doesn't change: a tight
**feedback loop** (the gate, run every change), **tests you trust** (behavior via public interfaces, not
mocks), **small reversible steps** (one behavior at a time, small commits, on a branch), **deep modules**
(the refactor step), and **human review** (the PR proof). `/tdd` enforces them so going fast stays safe.

## Prerequisite: a feedback loop must exist

You cannot do AFK work without a one-command **gate** (tests + typecheck + lint). If the repo has none
— e.g. a customer's brownfield codebase — establishing it is the FIRST task: write **characterization
tests** that pin current behavior before changing anything. **Hard gate: no loop, no AFK build.**

## The goal — definition of done (loop until this)

`/tdd` is **goal-driven**: keep looping red→green→refactor until **BOTH**:
1. **every acceptance criterion** (the Given/When/Then from `/align`) has a test that **failed before**
   the code and **passes after**, and
2. the **full one-command gate is green** (tests + typecheck + lint).

Don't stop at the first passing test — work through all the criteria. You're done only when the whole
slice is demoable end-to-end and the gate is green. Track which criteria are covered so you don't quit early.

## Keep the build quiet — interrupt only at real judgment points

AFK build should run *silent*, breaking only for decisions a human must own. Apply the **interrupt gate**
(CONTEXT.md): stop **only** when a choice is **irreversible** *and* **not inferable** (from the alignment,
PRD, or compliance profile) *and* **load-bearing now** — fail any one and **proceed**. When you do stop,
use the reserved opener `Your call —`, name the axis (**Taste · Risk · Scope · Compliance**), give the
cost of each side, and recommend. Everything reversible/low-stakes: just decide it (one terse line) or
**batch it into a single defaults digest for QA** — never a live interrupt. Wanting to ask a lot mid-build
is a signal the alignment was thin; note it for the next `/align`, don't drip-feed questions now. (This is
about *decisions*; the next rule is about being *blocked*.)

## When stuck — stop and surface, never flail or cheat

If a step won't go green after **~2–3 genuine attempts**, or you're thrashing, **STOP and surface to the
human**: what you tried, the error, your best hypothesis. Do **not** keep making random changes, and
**never** reach for a shortcut to force green. The gate going green must mean *the behavior works* —
never that you defeated the check.

**Forbidden ways to "make it pass" (these are failures, not solutions):**
- ❌ Deleting, skipping (`.skip`/`xfail`), weakening, or commenting out the test.
- ❌ Loosening an assertion to match wrong output, or asserting on a mock instead of behavior.
- ❌ `git commit --no-verify`, disabling the gate/lint/typecheck, or editing CI to pass.
- ❌ Mocking away the very behavior under test, or hardcoding the expected value.

**Never take destructive or irreversible actions to make progress:** no `rm -rf`, no `git push --force`,
no deleting files you didn't create, no dropping/mutating databases or running migrations, no touching
prod or real data, no disabling security/safety. Work on a **branch**, small commits, **don't push to a
remote without explicit OK**. If green seems to require any forbidden action, that's the signal to stop
and ask — not to do it.

## Core philosophy

Tests verify **behavior through public interfaces**, not implementation details.

- **Good test** — exercises real code paths via the public API; reads like a spec ("user can checkout
  with a valid cart"); survives internal refactors.
- **Bad test** — mocks internal collaborators, asserts on private methods, or checks state out-of-band.
  Tell-tale: it breaks on a refactor even though behavior didn't change.

## Workflow

1. **Plan** — confirm the interface/behavior changes for this slice; list the behaviors to test (not
   implementation steps); get user sign-off on the list.
2. **Tracer bullet** — write ONE failing test for ONE behavior (RED), then the minimal code to pass
   (GREEN). Confirm the full **gate** is green.
3. **Incremental loop** — for each remaining behavior: RED → GREEN → run the gate. One behavior at a
   time, so each test responds to what the last one taught you.
4. **Refactor** — only once tests are green: remove duplication, deepen modules, run the gate after
   each step. Never refactor on red.
5. **Governance** — no real PHI/PII/secrets in tests or fixtures; use synthetic data per the repo's
   `compliance-profile`.
6. **Logging governance — mandatory when the slice touches ePHI** (`compliance-profile` = `hipaa`, or any
   slice that reads/writes ePHI or emits logs on a PHI path). **These should already be acceptance
   criteria from `/align`'s healthcare check — just build-and-verify them.** If `/align` missed them
   (older ticket, criteria came in thin), add them now as a backstop. Either way they're **acceptance
   criteria, not optional extras** — build them red-green like any behavior:
   - **`safe-logging`** — runtime logs carry **references, never PHI/PII** (log a record id, not the
     record). Add a test asserting the PHI path's log output contains no PHI field values.
   - **`audit-logging`** — ePHI **reads, writes, and denied access** emit an audit entry (who / what +
     record id / when / where / outcome; **no PHI values**) from a central seam. Add the tests from
     `/audit-logging` (a read path emits an entry; a *denied* access still emits one; the entry has the
     record id but no PHI).
   For `none` profiles (no regulated data) this step is a no-op — `secrets` must still never be logged.

## Prove it — evidence in the PR + Jira (this is what makes review cheap)

When the slice is green, produce a **verification summary** so the reviewer / QA / PM can confirm it
*without re-deriving anything*. Review/QA is the real bottleneck now — this is the highest-leverage
thing you do. The tests are the proof; make that proof legible:

- **Criteria → test map:** each acceptance criterion (the Given/When/Then from `/align`) → the test(s)
  that cover it → ✓ passing. One line each.
- **Gate result:** the tests/typecheck/lint summary line (green).
- **Behavioral evidence:** show it actually works, not just that tests pass — a **before → after** for a
  fix (e.g. the old leaky JWKS body vs the new generic one), a curl/CLI example, or a screenshot/short
  recording for UI. This is the "demoable" proof.
- **Scope honesty:** what's done vs deferred vs intentionally faked.
- **Breaking change:** state it explicitly so the reviewer can't miss it — **"Breaking change: none"**, or
  **"Breaking change: YES — `<what contract/schema>`; compat plan: `<additive / versioned / expand-contract>`;
  consumers: `<who>`."** (Carry over whatever `/align` flagged + confirmed.) This is the line the reviewer
  must sign off on.

This summary is the **handoff artifact** — produce it here; **`/ship` publishes it** (into the PR
description + a Jira comment, after running `/phi-redaction-check` on the text). Don't post it from `/tdd`.

## Branch + ticket — start of work (the skill drives git)

Don't make the human do the git plumbing. At the **start** of the slice:
- **Pre-flight the ticket status — warn before working on something already done/in QA.** Read the ticket's
  current status via the tracker MCP. If it's **at or past review** — *In Review* / *Ready for QA* / *QA* /
  *Done* / *Closed* / *Resolved* / *Cancelled* (match the **category**, not the exact label) — **STOP and
  warn**: *"ACME-123 is in `<status>` — start work on it anyway?"* Proceed only on explicit confirmation.
  (A genuine reopen/bugfix is fine once confirmed — then transition back to *In Progress*.)
- **Move the ticket to _In Progress_** (tracker MCP) — this also anchors the worklog clock.
- **Create the working branch yourself** — off the repo's **base branch**, using its **naming convention**
  (read `.health-harness/project.json` `git` block / existing branches — e.g. CH branches off `dev`; don't
  impose MB's `fix/<KEY>` if the repo differs). Respect the existing flow.
- **Never commit on the base branch** — branch before the first commit (the wall ASKs on a base-branch
  commit). **During:** small, conventional commits referencing the ticket key. **Don't push without an OK.**

## Publish — hand off to /ship

When the slice is **green and the verification summary is ready, run `/ship`**: it pushes → opens the PR →
moves the ticket to **In Review** → comments the PR link + criteria→test → logs the worklog (suggested,
user-confirmed) → redaction-checks first, each step confirmed. `/ship` owns that flow so it happens one
consistent way — **don't re-implement push/PR/Jira/worklog here.** The dev's job ends at **merge**; address
review feedback by looping back through `/tdd`, then `/ship` again.

## Anti-patterns

- ❌ **Horizontal TDD** — writing all tests first, then all implementation. Produces imagined, brittle
   tests. Go behavior-by-behavior (vertical) instead.
- ❌ Writing the implementation first and backfilling tests (the cheating the discipline exists to stop).
- ❌ Mocking internals / asserting on private state — couples tests to implementation.
- ❌ Refactoring while a test is red.
- ❌ Declaring done without running the full gate.
- ❌ Starting work on a ticket already in QA/Done/Closed without warning + explicit confirmation.
- ❌ Re-implementing the publish flow (push/PR/Jira/worklog) here instead of handing off to `/ship`.

## Per-cycle checklist (checkable completion)

- [ ] The test describes behavior, not implementation, via the public interface only.
- [ ] The test failed before the code and passes after.
- [ ] The code added is minimal for this test — no speculative features.
- [ ] The full one-command gate is green.
- [ ] Test data is synthetic (no real PHI/PII/secrets).
- [ ] **If the slice touches ePHI:** logs are PHI-free (`safe-logging`) **and** ePHI read/write/denied emit audit entries (`audit-logging`) — both proven by tests. (No-op for `none` profiles; `secrets` never logged.)
- [ ] **Every** acceptance criterion is covered (looped to the goal, didn't stop early).
- [ ] Green was earned by working behavior — no test deleted/weakened/skipped, no gate bypassed.
- [ ] No destructive/irreversible action taken; work is on a branch, not force-pushed.
- [ ] Verification summary produced (criteria→test map, gate-green, before/after evidence).
- [ ] Ticket status pre-flighted: not already in QA/Done/Closed (or the user explicitly confirmed a reopen).
- [ ] Ticket moved to **In Progress** at start; work on a feature branch (not base).
- [ ] Published via **`/ship`** (push → PR → In Review → criteria→test comment → worklog, redaction-checked).

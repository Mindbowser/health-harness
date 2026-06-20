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

Put this in the **PR description**, and post a short **Jira comment** on the ticket linking the PR +
"acceptance criteria met." **Run `/phi-redaction-check` on the text first** — a PR/ticket is
third-party-visible; synthetic examples only, no real PHI/secrets.

## Branch + PR — the skill drives git, you approve the push

Don't make the human do the git plumbing — but **never push without an OK.**
- **Pre-flight the ticket status — warn before working on something already done/in QA.** Before anything,
  read the ticket's current status via the tracker MCP. If it's **at or past review** — *In Review* /
  *Ready for QA* / *QA* / *Done* / *Closed* / *Resolved* / *Cancelled* (status names vary by board — match
  the **category**, not the exact label) — **STOP and warn**: *"ACME-123 is in `<status>` — it looks done
  or already under QA. Start work on it anyway?"* Proceed only on the user's explicit confirmation. This
  catches the wrong ticket key, re-opening finished work, and double-assignment. (A genuine reopen/bugfix
  is fine once confirmed — then transition back to *In Progress*.)
- **Then move the ticket to _In Progress_** (via the tracker MCP) and **create the working branch
  yourself** — off the repo's **base branch**, using its **naming convention** (read
  `.health-harness/project.json` `git` block / look at existing branches — e.g. CH branches a feature off
  `dev`; do **not** impose MB's `fix/<KEY>` if the repo does otherwise). Respect the existing flow
  (brownfield rule). The _In Progress_ transition also **anchors the worklog clock** (its timestamp is the
  `started` fallback when git history is thin — see Time tracking).
- **Never commit on the base branch.** A freshly-cloned repo sits on `main`/`master` (or the configured
  `baseBranch`). Branch **before** the first commit — never let work land on the base. The wall enforces
  this: a `git commit` while HEAD is on a base branch **ASKs**, so an accidental on-base commit stops for
  your approval. (The repo's very first commit, when there's no history yet, is allowed.)
- **During:** small, conventional commits referencing the ticket key.
- **At the end (slice green + proof ready): open the PR** — title + the verification summary as the
  description, **targeting the repo's PR base** (e.g. `dev`/`QA`, not `main`, if that's their flow),
  linked to the Jira ticket. **Pushing + opening the PR is outward → do it only on the user's explicit
  OK.** Never `--force`. Use `gh` if available; otherwise stage the branch+commits and hand the user the
  exact push/PR command. When you later **re-push after review fixes**, add a **PR comment** noting what
  changed + gate-green (don't silently update).
- **Close the PM→dev loop in Jira:** once the PR is open —
  1. **Move the ticket to _In Review_** (= _Ready for QA_; one status in our flow) via the tracker MCP.
  2. **Comment** the PR link + "acceptance criteria met" + the criteria→test summary on the ticket.
  3. **Log work (worklog) — suggest, then let the human set it.** Run `node <health-harness>/bin/worklog-suggest.js`,
     show the suggestion, and log **only the value the user confirms or overrides** via
     `addWorklogToJiraIssue` (`timeSpent`, `started`, `commentBody` = what was done + PR link). Skip if the
     repo opted out (`project.json` `timeTracking.logWork:false`). See **Time tracking** below.

  That hands the ticket off to CI + peer review + QA. The dev's job ends at **merge** (CI green + review
  approved); **QA** then verifies the same criteria in the running app. Address review feedback by looping
  back through `/tdd`, not by patching around the gate. All three writes are **outward → the wall ASKs**,
  and **tracker-visible → run `/phi-redaction-check` on the text first**.

### Time tracking — suggest, then let the human set it

Hand-logging hours gets skipped, so the harness proposes a number; the human sets the final value.
There's **no perfect automatic number** — commits are the only deterministic signal, so the helper
reports two figures and the user decides; **don't nudge them up or down.**
- **Default = ACTIVE effort** from git on the working branch (`node bin/worklog-suggest.js`, or `--json`):
  a small **lead-in** before the first commit + the gap before each commit **capped at an idle threshold**
  (a long gap means you stepped away → capped, not summed). Beats raw wall-clock, which overcounts
  overnight/lunch. `started` = the first commit's timestamp.
- **Also shown: ELAPSED span** = first→last commit, for reference only.
- **Fallbacks:** thin history (one commit) floors to the lead-in — prefer the ticket's **_In Progress_
  transition** timestamp as `started`. No git/commits → suggest manually.
- **Show, then let the user set it:** present active + elapsed plainly and log the **value the user gives
  or confirms** — never auto-log, never argue the number up or down.
- **Configurable** in `.health-harness/project.json` `timeTracking`: `logWork`, `roundTo` (default 15m),
  `idleGapMins` (90), `leadInMins` (30), `maxPerDay` (8h).

## Anti-patterns

- ❌ **Horizontal TDD** — writing all tests first, then all implementation. Produces imagined, brittle
   tests. Go behavior-by-behavior (vertical) instead.
- ❌ Writing the implementation first and backfilling tests (the cheating the discipline exists to stop).
- ❌ Mocking internals / asserting on private state — couples tests to implementation.
- ❌ Refactoring while a test is red.
- ❌ Declaring done without running the full gate.
- ❌ Starting work on a ticket already in QA/Done/Closed without warning + explicit confirmation.

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
- [ ] PR + Jira carry the proof: criteria→test map, gate-green, before/after evidence (redaction-checked).
- [ ] Ticket status pre-flighted: not already in QA/Done/Closed (or the user explicitly confirmed a reopen).
- [ ] Ticket lifecycle moved: **In Progress** at start → **In Review** (= Ready for QA) at PR open.
- [ ] Worklog logged at the **user-confirmed** time (or the repo opted out via `timeTracking.logWork:false`).

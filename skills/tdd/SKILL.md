---
name: tdd
description: Test-driven development using red-green-refactor cycles — the way AFK build work is done.
---

Implement a vertical slice with **test-driven development**: write a failing test, make it pass with
minimal code, refactor. This is how all AFK (away-from-keyboard) build work is done in the Build Loop.
TDD is mandatory here — it stops the agent from faking tests, and good tests are the feedback loop that
caps how well the agent can code.

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
- **At the start of build, create the working branch yourself** — off the repo's **base branch**, using
  its **naming convention** (read `.mb-harness/project.json` `git` block / look at existing branches —
  e.g. CH branches a feature off `dev`; do **not** impose MB's `fix/<KEY>` if the repo does otherwise).
  Respect the existing flow (brownfield rule).
- **During:** small, conventional commits referencing the ticket key.
- **At the end (slice green + proof ready): open the PR** — title + the verification summary as the
  description, **targeting the repo's PR base** (e.g. `dev`/`QA`, not `main`, if that's their flow),
  linked to the Jira ticket. **Pushing + opening the PR is outward → do it only on the user's explicit
  OK.** Never `--force`. Use `gh` if available; otherwise stage the branch+commits and hand the user the
  exact push/PR command.

## Anti-patterns

- ❌ **Horizontal TDD** — writing all tests first, then all implementation. Produces imagined, brittle
   tests. Go behavior-by-behavior (vertical) instead.
- ❌ Writing the implementation first and backfilling tests (the cheating the discipline exists to stop).
- ❌ Mocking internals / asserting on private state — couples tests to implementation.
- ❌ Refactoring while a test is red.
- ❌ Declaring done without running the full gate.

## Per-cycle checklist (checkable completion)

- [ ] The test describes behavior, not implementation, via the public interface only.
- [ ] The test failed before the code and passes after.
- [ ] The code added is minimal for this test — no speculative features.
- [ ] The full one-command gate is green.
- [ ] Test data is synthetic (no real PHI/PII/secrets).
- [ ] **Every** acceptance criterion is covered (looped to the goal, didn't stop early).
- [ ] Green was earned by working behavior — no test deleted/weakened/skipped, no gate bypassed.
- [ ] No destructive/irreversible action taken; work is on a branch, not force-pushed.
- [ ] PR + Jira carry the proof: criteria→test map, gate-green, before/after evidence (redaction-checked).

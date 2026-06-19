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

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

**Planning is test-first too.** If you plan the slice first (plan mode), the plan itself must be
structured red→green→refactor — each step names the **failing test** it starts from, not "implement X then
add tests." The wall backstops this: on `ExitPlanMode`, a build plan with no test-first structure gets a
one-line reminder before it's accepted (`bin/plan-tdd-check.js`). Fix the plan, don't backfill tests.

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

**Re-check the cross-cutting concerns for this slice** (they should already be criteria from `/align`):
`node "…/bin/concerns.js" "<slice description>" --profile <profile>` lists the concerns it triggers
(timezone/DST, audit, PHI-safe logging, error handling, scale/pagination, authz, i18n). Any `needsTest`
concern without a test is a gap — write the test (a DST-matrix test, a no-stack-trace error test, a
realistic-volume pagination test, …) before you call the slice done. If `/align` missed one, add it now.

**Bind each test to its criterion — coverage is enforced deterministically, not on trust.** When the ticket
has a committed criteria manifest (`.health-harness/criteria/<KEY>.json`, written by `/align`), name the
criterion's `[AC-N]` id in the test (e.g. `test('[AC-2] uncovered criterion denies the push', …)`). Run
`node "/Users/pravinuttarwar/.claude/plugins/cache/mindbowser/health-harness/0.2.21/bin/criteria-coverage.js" --explain`
as the loop's exit check: every authored criterion must be pinned. The `/ship` wall **DENY**s a push with an
uncovered criterion (you self-correct by writing the test) — so this isn't optional. A criterion that genuinely
can't be pinned yet gets a `defer` reason in the manifest (downgrades that one to a conscious ASK at ship).

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

**Green must reflect REAL end-to-end behavior, not a mock for an unbuilt layer (MBI-101).** When the
backend and frontend land as separate slices, a FE slice built against a stub for an API that doesn't exist
yet can go green while nothing actually works end-to-end. So a slice that depends on an **unbuilt API** must
either be **blocked** by the API slice, or carry a **contract test** both sides share (or an integration
test at the seam) — check with `node "…/bin/contract-guard.js" --depends [--contract|--integration]`. Never
let a slice sit quietly green on a stub.

## Workflow

1. **Plan** — confirm the interface/behavior changes for this slice; list the behaviors to test (not
   implementation steps); get user sign-off on the list.
2. **Tracer bullet** — write ONE failing test for ONE behavior (RED), then the minimal code to pass
   (GREEN). Confirm the full **gate** is green.
3. **Incremental loop** — for each remaining behavior: RED → GREEN → run the gate. One behavior at a
   time, so each test responds to what the last one taught you. **One task should encode one behavior**
   (MBI-102): if a task's criteria describe more than one behavior (`node "…/bin/behavior-count.js" "<criteria>"`
   returns ≥2), it was under-sliced — its single behavior test can't deterministically confirm it. Prefer
   getting it re-sliced at `/to-issues`; the task is *done* only when its one behavior test goes red→green.
4. **Refactor** — only once tests are green: remove duplication, deepen modules, run the gate after
   each step. Never refactor on red.
4b. **Scale governance — when the slice touches a collection (list / pagination / search / batch).** A gate
   that only ever tests N=3 silently passes pagination-class bugs (the real-world break: pagination that
   worked on small lists failed at volume). Get the boundary + volume cases from
   `node "…/bin/scale-hints.js" "<slice description>" --page <pageSize>` — **empty, single, exactly one page,
   just over a page, and a realistic large N** (default 1000 when the PRD didn't specify). Write a test at
   large N + the boundaries, red-green like any behavior. (Advisory nudge, not a hard block — but don't skip
   it on a paged/searched/listed feature.)
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
7. **Timezone governance — when the slice touches a date/time API.** A gate that only ever runs in your
   home zone (or UTC) silently passes code that breaks for users elsewhere. **Resolve it at build time —
   don't let the wall block you at push.** When you add a date/time API and there's no `tz-safe` marker or
   `timezone` criterion yet (`tzGateAction` returns `decide`):
   - **Human present → ASK** (the framing carries the teaching: *users in other timezones / across DST &
     offset boundaries may see wrong results*). Three durable outcomes:
     | Answer | Do this |
     |---|---|
     | **Converts user-facing time** | add a `kind:timezone` acceptance criterion + write the DST/offset **matrix test**, build it red-green |
     | **Internal / UTC-only / duration** | mark the line `// tz-safe: <reason>` |
     | **Not sure — defer** | leave the criterion open + a tracked TODO (do **not** silently pass) |
   - **AFK / no human → decide and record, never skip:** obviously a duration/internal-UTC/log timestamp →
     `// tz-safe:<reason>`; otherwise apply the **safe default** — treat as TZ-relevant, add the criterion +
     matrix test. (A needless matrix test is cheap; a missed conversion bug ships to every user in the wrong zone.)

   Then **run the gate under a hostile clock**, not the bare gate: `node bin/tz-gate.js --invocation` prints
   the recommended `TZ=<hostile> <gate>` (zone differs from the team's home + has DST — e.g.
   `TZ=America/New_York npm test` for the Kolkata-based team). Green under the hostile clock is the bar.
   (Wall backstop: the date/time criterion DENYs a push that has neither a marker nor the criterion.)

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
- **Capture the status-transition stream (FASTER telemetry — MBI-46):** after the move, fetch the issue with
  `expand=changelog` + its transitions, write the raw responses to temp JSON files, and run
  `node "${CLAUDE_PLUGIN_ROOT}/bin/usage-log.js" emit-transitions <issue.json> <transitions.json>` (transitions
  optional). Deterministic, metadata-only, dedup-safe — records the In Progress transition for cycle-time.
- **Create the working branch yourself** — off the repo's **base branch**, using its **naming convention**
  (read `.health-harness/project.json` `git` block / existing branches — e.g. CH branches off `dev`; don't
  impose MB's `fix/<KEY>` if the repo differs). Respect the existing flow.
- **Never commit on the base branch** — branch before the first commit (the wall ASKs on a base-branch
  commit). **During:** small, conventional commits referencing the ticket key. **Don't push without an OK.**

## Publish — hand off to /ship

When the slice is **green and the verification summary is ready**, publish via `/ship`: it pushes → opens
the PR → moves the ticket to **In Review** → comments the PR link + criteria→test → logs the worklog
(suggested, user-confirmed) → redaction-checks first, each step confirmed. `/ship` owns that flow so it
happens one consistent way — **don't re-implement push/PR/Jira/worklog here.**

> **`/ship` is human-triggered — the agent CANNOT invoke it** (`disable-model-invocation: true`). So when
> you're an agent and the build is green: **STOP and hand off** — print the verification summary and tell the
> user *"ready — run `/ship <KEY>`."* **Do NOT freelance the publish** (`git push` / `gh pr create` /
> Jira transition) yourself — that bypasses the redaction + breaking-change + worklog steps `/ship` guarantees,
> and the wall will redirect a raw push back to `/ship` anyway. Handing off IS the disciplined path, not a
> limitation to work around.

The dev's job ends at **merge**; address review feedback by looping back through `/tdd`, then `/ship` again.

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

---
name: onboard-existing-codebase
description: Make an existing/customer (brownfield) repo agent-ready — comprehend it, write a repo CLAUDE.md, and establish a feedback loop before any build.
argument-hint: "What are we here to change/add?"
---

Prepare an **existing** codebase (a customer's repo, or any old project) so the Build Loop can run on
it safely. This is the front door for the **brownfield** archetype. You do this **once**, before any
`/align`, and you do NOT change behavior until the feedback loop exists. Respect the repo as you found
it — their conventions, their architecture, their IP.

## Process

1. **Comprehend the repo.** Read the README + run/setup docs, the package manifest(s), entry points,
   and the main modules. Map: the stack, how to run it, how to test it, the high-level architecture,
   the key seams (where you'd safely make a change), and the conventions in use.
2. **Create OR augment the repo `CLAUDE.md` — never clobber.** If a `CLAUDE.md` (or `ARCHITECTURE.md`,
   `AiRules.md`) **already exists**, READ it and **add only what's missing** (e.g. a short harness
   section: the gate command, compliance profile, seams) — do not overwrite a rich existing doc. If none
   exists, write one: stack + versions, the run command, the test command, an architecture sketch, the
   conventions to follow (theirs, not MB's), known gotchas, and the seams for the change at hand.
2b. **Write `.health-harness/project.json`** — the durable project facts later skills read (don't make them
   re-derive): repos/submodules + paths, stack, default branch, the gate command, the tracker coords
   (`jira.projectKey` / `cloudId` / `site`), and the **`git` convention** — observe existing branches/PRs
   to capture `baseBranch`, `branchPattern`, `prTarget` (e.g. CH branches a feature off `dev`, PRs to
   `dev`). `/tdd` uses this so it branches + opens PRs *their* way, not MB's. See CONTEXT.md for the shape.
   **Also set the `commit` policy — respect a real convention, but ELEVATE the absence of one.** The wall
   format-gates commit messages; scan recent subjects and judge which case you're in:
   - **Consistently conventional** (`type(scope): …`) → keep the default (`commit.conventional:true`).
   - **A consistent *different* intentional style** (e.g. every commit ticket-prefixed `ABC-123: …`) → respect
     it: `commit.conventional:false` (and `requireTicket:true` if they reliably key commits). Don't impose
     MB's style on a deliberate one.
   - **Inconsistent / low-quality** (`fixed`, `update`, `wip` — no real convention) → **do NOT perpetuate it.**
     Keep `commit.conventional:true` to raise the bar to the industry standard, **flag it to the human** as a
     recommended improvement (not a silent imposition), and note it in `CLAUDE.md`. Absence of a convention is
     a gap to close, not a convention to honor — the harness is a discipline.
2c. **Set `.gitignore`** — add `.health-harness/sprints/` and `.health-harness/current-sprint` (scratch/volatile,
   not committed). `project.json` + `compliance.json` + `CLAUDE.md` ARE committed (durable config). The
   PRD/align notes live only locally; their durable form is the Jira ticket.
3. **Establish the feedback loop — HARD GATE.** Find the existing gate (tests / typecheck / lint /
   build). Run it. The gate is **tests + typecheck + lint** — a linter that exists but isn't *in the
   gate* is not enforced, so **make lint part of the one-command gate** (a lint failure must fail the gate).
   - If a working one-command gate exists and passes → record it in `CLAUDE.md`.
   - **Detect the linter deterministically** (don't eyeball it): `node "…/bin/lint-detect.js" --gate "<your gate cmd>"`
     reports `{present, command, inGate}`. `present:true, inGate:false` = the repo lints but the gate
     doesn't run it → **add it to the gate**. `present:false` = no linter → establish one (or record a
     conscious opt-out). The result feeds the `lint` convention below.
   - If it's missing, broken, or thin → **write characterization tests** that pin the *current*
     behavior around where you'll work, and assemble a one-command gate. **Do not change any behavior
     until this gate is green.** No feedback loop ⇒ no AFK build (Matt: no loop = no quality ceiling).
   - **Record conventions + gate completeness** (so the build loop's compliance checks are deterministic,
     not guessed): the existing centralised **logger** module + **rotation**, the **audit** helper, the
     **datetime** policy, and whether **lint / typecheck / coverage-%** are in the gate —
     `node "/Users/pravinuttarwar/.claude/plugins/cache/mindbowser/health-harness/0.2.21/bin/conventions.js" set '<json>'`.
     A brownfield repo MISSING one (no centralised logger, lint not wired) → **flag it as a gap to
     establish** (`… conventions.js gaps`), don't silently re-discover it each ticket. The compliance
     detectors read `.health-harness/conventions.json` to upgrade a heuristic ASK into a deterministic DENY.
   - **DB check:** the pre-flight flags it, but confirm — if the repo has a **database but no migration
     layer** (Prisma/Knex/TypeORM/Alembic/Liquibase/Rails/Django/…), raise it: schema changes have no safe,
     reversible path. Recommend adding one *before* any schema work (no DB → ignore).
4. **Declare the compliance profile.** Run `/compliance-profile` (default `hipaa`) → `.health-harness/compliance.json`.
   Run the scanner once for a baseline: `node <health-harness>/bin/redaction-scan.js --path .` so you know
   what's already there before you add anything.
4b. **Governance baseline — for `hipaa`/ePHI repos.** Before building, assess the two runtime logging
   controls and **flag gaps as first tasks** (don't silently fix):
   - **Audit trail (`audit-logging`)** — is there a *central seam* that records ePHI read/write/denied
     access (who/what/when/where/outcome, no PHI)? If absent or per-call-site/scattered → log a gap.
   - **PHI-safe logging (`safe-logging`)** — do operational/error logs reference ids, not PHI values?
     Spot-check the logging boundary; if PHI can reach logs → log a gap.
   Record findings in `CLAUDE.md`; missing controls become **characterization-first tasks** (pin current
   behavior, then add the control via `/tdd`). No-op for `none` profiles.
5. **Respect their world.** Match the existing code style and patterns; do NOT impose MB boilerplate,
   reformat the repo, or do unrequested refactors. Do not exfiltrate code outside the engagement.
6. **Enter the loop.** Now run `/align` around the specific change, then `/to-issues` (slicing must fit
   *their* architecture), then `/tdd` against the gate from step 3.

## Anti-patterns

- ❌ Editing behavior before a feedback loop exists. Characterization tests come first.
- ❌ Imposing MB conventions/boilerplate, reformatting, or refactoring beyond the ask.
- ❌ Treating the repo like greenfield (it isn't — `scaffold-from-boilerplate` is the wrong door).
- ❌ Assuming `none` for compliance. Default `hipaa` until told otherwise.
- ❌ A giant "understand everything" pass. Comprehend enough for the change at hand; go deeper as needed.

## Completion criteria

- [ ] A repo `CLAUDE.md` exists: stack, run cmd, test cmd, architecture sketch, conventions, seams.
- [ ] A one-command feedback loop exists and is green (theirs, or characterization tests you added).
- [ ] `.health-harness/compliance.json` is set (default `hipaa`); a baseline redaction scan has run.
- [ ] For `hipaa`/ePHI repos: audit-trail + PHI-safe-logging baseline assessed; gaps recorded in `CLAUDE.md` as first tasks.
- [ ] No behavior changed yet; existing style/conventions are documented to follow.
- [ ] Ready to start the change at `/align`.

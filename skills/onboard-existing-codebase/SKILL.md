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
2c. **Set `.gitignore`** — add `.health-harness/sprints/` and `.health-harness/current-sprint` (scratch/volatile,
   not committed). `project.json` + `compliance.json` + `CLAUDE.md` ARE committed (durable config). The
   PRD/align notes live only locally; their durable form is the Jira ticket.
3. **Establish the feedback loop — HARD GATE.** Find the existing gate (tests / typecheck / lint /
   build). Run it.
   - If a working one-command gate exists and passes → record it in `CLAUDE.md`.
   - If it's missing, broken, or thin → **write characterization tests** that pin the *current*
     behavior around where you'll work, and assemble a one-command gate. **Do not change any behavior
     until this gate is green.** No feedback loop ⇒ no AFK build (Matt: no loop = no quality ceiling).
4. **Declare the compliance profile.** Run `/compliance-profile` (default `hipaa`) → `.health-harness/compliance.json`.
   Run the scanner once for a baseline: `node <health-harness>/bin/redaction-scan.js --path .` so you know
   what's already there before you add anything.
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
- [ ] No behavior changed yet; existing style/conventions are documented to follow.
- [ ] Ready to start the change at `/align`.

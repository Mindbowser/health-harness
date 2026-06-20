---
name: scaffold-from-boilerplate
description: Start a new (greenfield) project from MB boilerplate, wired with the gate and a compliance profile.
argument-hint: "Project name + stack (e.g. 'patient-portal, React+Node')"
---

Stand up a brand-new repo from Mindbowser's boilerplate so it enters the Build Loop **already
agent-ready**: a one-command gate, a declared compliance profile, and the harness installed. This is
the front door for the **greenfield** archetype — the most common way MB projects start. Use it once,
at project birth, before any `/align`.

## Wrong tool? — redirect first

**If the repo already has source code, STOP — this is the wrong door.** Use
`/onboard-existing-codebase` instead (that respects the existing code; this would scaffold over it).
`/start` routes correctly; only reach here for a genuinely empty/new project.

## Process

1. **Confirm the stack + project name.** Pick the MB boilerplate(s): frontend (React/TS), backend
   (Node/Express/Postgres/TS), or both for a monorepo. Use the configured boilerplate source (env/config),
   not a hardcoded URL.
2. **Clone read-only.** `git clone --depth 1` the boilerplate(s) into the new project; remove their
   `.git`; re-init a fresh repo. **Never push back to the boilerplate repos — they are clone-only.**
3. **Wire the gate.** Ensure a single one-command gate exists and passes on the empty project
   (typecheck + build + tests, e.g. `pnpm verify`), with a coverage ratchet if the stack supports it.
   *Feedback loops are the quality ceiling — the project is not ready without this.*
4. **Set the compliance profile.** Run `/compliance-profile` to write `.mb-harness/compliance.json`.
   **Default to `hipaa`** (the MB fail-safe); only set a lighter profile if the user confirms the repo
   handles no PHI.
5. **Install the harness.** Reference the `mb-harness` plugin and add a repo `CLAUDE.md` that states the
   stack, the gate command, and the active compliance profile.
6. **Verify it boots.** Install deps, run the gate green, confirm the dev server starts. Commit the
   scaffold as the first commit.

## Anti-patterns

- ❌ Pushing to or branching the MB boilerplate repos. Clone fresh, re-init.
- ❌ Leaving the gate unwired ("we'll add tests later") — then no AFK build is safe.
- ❌ Skipping the compliance profile, or defaulting it to `none` (the default is `hipaa`).
- ❌ Scaffolding *and* starting to build features in one go. Scaffold, then `/align` first.

## Completion criteria

- [ ] New repo created from the right boilerplate(s); boilerplate history removed; fresh git init.
- [ ] The one-command gate exists and passes on the empty project.
- [ ] `.mb-harness/compliance.json` is set (via `/compliance-profile`) and reflected in `CLAUDE.md`.
- [ ] The `mb-harness` plugin is referenced; the dev server boots.
- [ ] First commit is the clean scaffold (no feature code yet).

Next: `/align` to start the Build Loop.

> **Backing implementation (to generalize):** mbi-studio's `openclaw-scripts/prototype/scaffold.js`
> already does the read-only boilerplate clone + overlay + `ensurePnpmBuilds` + favicon + install +
> per-project skills. Generalizing it (FE/BE choice, gate wiring, profile init) is the engine this
> skill drives.

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

## Boilerplate source — resolve from the central registry, never hardcode a URL

MB keeps **one boilerplate per tech stack**, listed in a **central registry** (single source of truth) so
new projects scaffold with zero per-project setup. Don't ask the user for a URL and don't hardcode one —
resolve the stack against the registry:

```bash
node "${CLAUDE_PLUGIN_ROOT}/bin/boilerplate-registry.js" list                # show available stacks
node "${CLAUDE_PLUGIN_ROOT}/bin/boilerplate-registry.js" resolve "<stack>"   # → {"key","repo","kind"}
```

- The registry is **baked into the plugin** (`config/boilerplates.json`) — zero setup. Cloning the private
  boilerplates uses `MB_BOILERPLATE_TOKEN` (set once in `~/.claude/settings.json` → `env`, or org-wide via
  FleetDM). Optionally point at a central registry repo with `MB_BOILERPLATE_REGISTRY`. See
  `docs/boilerplates.md`.
- **Flow:** if the user named a stack, `resolve` it; if it's ambiguous or unspecified, run `list` and let
  them pick. If `resolve` exits non-zero, show the available stacks — never invent a URL.

## Process

1. **Confirm the stack + project name**, then `resolve` the stack to its `repo` via the registry helper
   above (clone with `MB_BOILERPLATE_TOKEN`). `kind` (frontend/backend/monorepo) tells you the layout.
2. **Clone read-only.** `git clone --depth 1` the boilerplate(s) into the new project; remove their
   `.git`; re-init a fresh repo. **Never push back to the boilerplate repos — they are clone-only.**
3. **Wire the gate.** Ensure a single one-command gate exists and passes on the empty project
   (**lint + typecheck + build + tests**, e.g. `pnpm verify`), with a coverage ratchet if the stack
   supports it. **Lint must be in the gate** (a lint failure fails the gate) — confirm with
   `node "…/bin/lint-detect.js" --gate "<gate cmd>"` (`inGate:true`).
   **Prove it's TDD-ready:** `node "…/bin/test-detect.js"` should report `runnable:true`; then run the
   red→green smoke (a throwaway failing test → RED → make it pass → GREEN → delete it) so the loop is
   proven, and record the `gate` + `testFramework` in `.health-harness/project.json`.
   *Feedback loops are the quality ceiling — the project is not ready without this.*
4. **Set the compliance profile.** Run `/compliance-profile` to write `.health-harness/compliance.json`.
   **Default to `hipaa`** (the MB fail-safe); only set a lighter profile if the user confirms the repo
   handles no PHI.
4b. **Record project conventions + gate completeness** (so the build loop's compliance checks are
   deterministic, not guessed). The boilerplate's centralised **logger** module + **rotation**, the
   **audit** helper, the **datetime** policy, and that **lint / typecheck / coverage-%** are in the gate —
   `node "/Users/pravinuttarwar/.claude/plugins/cache/mindbowser/health-harness/0.2.21/bin/conventions.js" set '<json>'`.
   Anything the boilerplate lacks → establish it now or record a deferred gap (`… conventions.js gaps`). The
   compliance detectors read `.health-harness/conventions.json` to upgrade a heuristic ASK to a deterministic DENY.
5. **Install the harness.** Reference the `health-harness` plugin and add a repo `CLAUDE.md` that states the
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
- [ ] `.health-harness/compliance.json` is set (via `/compliance-profile`) and reflected in `CLAUDE.md`.
- [ ] The `health-harness` plugin is referenced; the dev server boots.
- [ ] First commit is the clean scaffold (no feature code yet).

Next: `/align` to start the Build Loop.

> **Backing implementation (to generalize):** mbi-studio's `openclaw-scripts/prototype/scaffold.js`
> already does the read-only boilerplate clone + overlay + `ensurePnpmBuilds` + favicon + install +
> per-project skills. Generalizing it (FE/BE choice, gate wiring, profile init) is the engine this
> skill drives.

---
name: start
description: Start here — detect the project archetype (new / existing / Studio handover) and route to the right front door.
disable-model-invocation: true
argument-hint: "What are we doing? (optional)"
---

The single entry point. Run this first in any repo. It figures out **which archetype** you're in and
sends you through the correct front door — so nobody has to remember whether to scaffold, onboard, or
ingest a handover. It also makes sure the compliance profile is set, which every path needs.

## Process

0. **Run the pre-flight check first** — turn silent setup gaps into a clear checklist before anything else:

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/preflight.js"
   ```

   Show the user the output. It deterministically checks git identity (company email), git remote, current
   branch, the **GitHub CLI (`gh`)** presence + auth, the test gate, the compliance profile, and recorded
   tracker coords. **Clear every ❌ before building** (no git email → mis-attributed commits/metrics; no/stub
   gate → no safe AFK build); ⚠️ items are worth fixing now rather than mid-build — including `gh` (step 4),
   so the first `/ship` opens the PR automatically instead of dropping to paste-mode. The pre-flight can't
   see the live Jira/Linear MCP — verify that in step 4 by actually listing issues.

1. **Detect the archetype** from the working directory — two cases:
   - **Empty / no source** (just `.git`, maybe a README) → **new repo (greenfield)**.
   - **Has existing source code** (any stack) → **existing repo**.
2. **Confirm with the user** — state the detected archetype and why; let them correct it. Never route
   blind (a near-empty repo might still be an existing clone mid-setup).
3. **Ensure the compliance profile is set.** If `.health-harness/compliance.json` is missing, run
   `/compliance-profile` (default `hipaa`). Both paths need this before work starts.
4. **Connect the tracker + confirm git identity (once per project/person).** Set these up *here*, not
   mid-build:
   - **Tracker (Jira/Linear) MCP** — verify it's connected (the agent can "list issues in the current
     sprint"). If not, set it up per `docs/jira.md` (or proceed in **paste-mode**). Record the Jira coords
     (`projectKey`, `cloudId`, `site`) in `.health-harness/project.json` so `/align`, `/import-issues`, and
     the `/tdd` worklog don't re-derive them. **Don't hard-block** if it can't connect — note paste-mode.
     - **Capture the workflow transition map once (so `/ship` never guesses a status name).** Fetch a real
       ticket's transitions with `getTransitionsForJiraIssue`, pipe them through
       `node "${CLAUDE_PLUGIN_ROOT}/bin/jira-transitions.js" infer` → it returns `{onStart,onShip,onMerge}`
       mapped to the project's actual names/ids. **Show the inferred mapping and confirm once** (only ask
       per-slot if `needsConfirm` is true — ambiguous or missing). Persist with `… jira-transitions.js write`
       → `jira.transitions` in `project.json`. It's **committed**, so teammates and every later ticket reuse
       it with zero input; `/ship` self-heals it if the workflow ever changes.
   - **Git identity** — confirm `git config user.email` is the **company email** (the work identity used in
     commits, PRs, and the harness usage metrics); set it if it's missing or personal.
   - **Publish path (get commits to the remote + open the PR) — settle it here so `/ship` is one command
     later.** `/ship` **auto-detects**: it prefers a real `git push` (keeps your commit history) and falls
     back to a credential-free GitHub MCP. Make sure one is ready:
     - **Preferred — push works.** Confirm `git push` will succeed: an **SSH** remote just works; **HTTPS**
       needs a helper or token (`gh auth login` sets that up). Then the PR opens via `gh` or a GitHub MCP. If
       the pre-flight flagged `gh` (missing/unauthed) and you'll publish this way, **offer to set `gh` up
       now**: show the OS install command from the `fix` line, run it on the user's OK (confirmation-gated,
       never silent), have them run `! gh auth login`, and re-run the pre-flight to confirm green.
     - **Zero-setup fallback — a connected GitHub MCP.** If push creds aren't set up but a GitHub MCP is
       connected, `/ship` can commit the changed files (`push_files` / Contents API) **and** open the PR with
       the MCP's token — **no `gh`, no SSH key, no local creds.** Tradeoff: fresh **API commits**, not your
       local commit history (fine if you squash-merge).
     **Don't hard-block** — if neither is ready, note `/ship` will hand over the manual push/PR commands.
   - **Your role (once per person)** — if `~/.health-harness/role` is unset, ask whether they're **PM/BA** or
     **Engineer** and run `/role <answer>` to persist it. This sets `/align`'s default mode so it never has to
     guess. (Set once; it carries across all repos.)
5. **Route to the front door:**

   | Archetype | Front door |
   |---|---|
   | New repo | `/scaffold-from-boilerplate` |
   | Existing repo (incl. a handed-over project that already has code) | `/onboard-existing-codebase` |

6. **Hand off.** Once the front door's completion criteria are met, the project enters the Build Loop at
   `/align`. The loop is identical for both archetypes from there.

> **The feedback-loop gate check is NOT skippable.** A repo with great docs (CLAUDE.md, ARCHITECTURE.md)
> can tempt you to skip `/onboard-existing-codebase` — that's fine for the *docs-reading* part, but you
> MUST still confirm a one-command test gate exists. If `npm test`/equivalent is missing or a stub,
> establishing it (characterization tests) is the first task before any `/tdd`. No gate → no AFK build.

> A project handed over with code already in it arrives, to you, as an **existing repo** — take the
> existing-repo door and read any included docs/spec as context. There's no separate path to learn.

## Anti-patterns

- ❌ Routing without confirming the detected archetype.
- ❌ Skipping the compliance profile because "we'll set it later".
- ❌ Sending an existing repo to `/scaffold-from-boilerplate` (wrong door — it's the existing-repo path).
- ❌ Committing work on the base branch. A fresh clone lands on `main`/`master` — branch before the first
  commit; never let work land on the base. The wall ASKs on a `git commit` while HEAD is on a base branch.
- ❌ Discovering mid-build that the tracker isn't connected or git email is personal — set both at onboarding.

## Completion criteria

- [ ] Pre-flight run and every ❌ cleared (git email set, a real test gate exists).
- [ ] The archetype is detected (new vs existing) AND confirmed by the user.
- [ ] `.health-harness/compliance.json` exists (default `hipaa`).
- [ ] Tracker MCP connected (Jira coords in `project.json`) **or** paste-mode noted; `git user.email` = company email.
- [ ] Harness role set (`~/.health-harness/role` = `pm` or `engineer`) so `/align` doesn't guess.
- [ ] The correct front-door skill has been invoked.

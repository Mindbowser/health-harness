---
name: ship
description: Publish a finished slice — push the branch, open the PR, transition the Jira ticket, log the worklog — each step confirmed. The single, consistent end-of-work flow that /tdd hands off to.
disable-model-invocation: true
argument-hint: "(optional) ticket key, e.g. ACME-258"
---

The **publish/handoff** step, run once a slice is built and the gate is green (usually right after `/tdd`).
It drives the git + tracker plumbing so the human doesn't have to — but **nothing outward happens without an
explicit OK**. This is the *only* place the ship flow lives, so `/tdd` and any other build path hand off here
rather than re-implementing it (one definition, no drift).

> **Boundary:** `/tdd` = build (red→green→refactor, gate green, produce the verification summary). `/ship` =
> publish (push → PR → Jira → worklog). `/tdd` stops at "green + proof ready" and calls `/ship`.

## Preconditions (verify, don't assume)
- The slice is **green** (full one-command gate passes) and a **verification summary** exists (criteria→test
  map, gate result, before/after evidence). If not, go back to `/tdd` — don't ship un-green work.
- You're on a **feature branch**, not the base (`main`/`master`/the configured `baseBranch`). If on base,
  STOP and branch first (the wall blocks base-branch commits anyway).
- Resolve the **ticket key** from the branch/commits (the `[A-Z][A-Z0-9]+-\d+` pattern) or the argument; if
  none, ask — or proceed PR-only and note no ticket was linked.

## Process — each outward step is confirmation-gated
1. **Show the plan, get one confirmation.** State exactly what will happen: *push `<branch>` → open PR into
   `<base>` → move `<TICKET>` to In Review → comment the PR link → log `<suggested time>`.* Let the user
   approve all, edit, or cherry-pick steps. Detect what's available up front: `gh` installed? tracker MCP
   connected? — and adapt (see fallbacks).
2. **Redaction-check first.** A PR/ticket is third-party-visible — run `/phi-redaction-check` on the PR title,
   body, and Jira comment text. Synthetic examples only; no real PHI/secrets. Fix before sending.
3. **Push the branch** (on OK). Never `--force`. Small, conventional commits referencing the ticket key
   should already exist; commit any remainder first (on a feature branch).
4. **Open the PR** (on OK) — title + the **verification summary as the body**, targeting the repo's **PR base**
   (e.g. `dev`/`QA`, not `main`, if that's their flow), linked to the ticket. Use `gh pr create` if present;
   otherwise hand the user the exact `git push` + PR command/URL. **Surface the "Breaking change:" line near the
   top of the PR body** (none, or YES + the compat plan) so the reviewer must consciously sign off on it.
5. **Close the PM→dev loop in Jira** — these are **three separate MCP calls**; doing one does not do the others:
   1. **Transition** the ticket — **deterministically, by stored id; never guess the status name.** Read
      `jira.transitions.onShip` from `.health-harness/project.json` and call `transitionJiraIssue` with that
      `id`. **Self-heal** if it's missing or the id is rejected (workflow changed): fetch the live list with
      `getTransitionsForJiraIssue`, pipe it through `node <health-harness>/bin/jira-transitions.js infer`,
      confirm the mapping once, persist it (`… jira-transitions.js write`), then transition. (Captured at
      `/start`, so steady-state this is a config read with no input.)
   2. **Comment** the PR link + "acceptance criteria met" + the criteria→test summary. Write clean Markdown
      with `contentFormat:"markdown"` — never Jira wiki markup (`h2.`, `{{}}`).
   3. **Log the worklog — and actually call it.** Run `node <health-harness>/bin/worklog-suggest.js`, show the
      suggestion, then call `addWorklogToJiraIssue` (`cloudId`, `issueIdOrKey`, `timeSpent`, `started`,
      `commentBody` = what was done + PR link) with the **user-confirmed** value and confirm it returned ok.
      A comment or a transition is **not** a worklog. (Skip only if `project.json` `timeTracking.logWork:false`.)
6. **Report** what landed: PR URL, new ticket status, worklog confirmation. The dev's job ends at **merge**
   (CI green + review approved); QA then verifies the same criteria in the running app.

**Re-push after review fixes:** loop back through `/tdd` for the change, then `/ship` again — it adds a **PR
comment** noting what changed + gate-green (don't silently update), and re-confirms the worklog delta.

## Time tracking — suggest, then let the human set it
No perfect automatic number exists; commits are the only deterministic signal, so propose and let the user
decide — **never auto-log, never argue the number up or down.**
- **Default = ACTIVE effort** from git (`node bin/worklog-suggest.js`, or `--json`): a small lead-in + the
  gap before each commit capped at an idle threshold (a long gap = stepped away → capped). `started` = first
  commit's timestamp.
- **Also shown: ELAPSED span** (first→last commit) for reference.
- **Fallbacks:** thin history → floor to the lead-in, or use the ticket's *In Progress* transition timestamp
  as `started`. No git → suggest manually.
- **Configurable** in `.health-harness/project.json` `timeTracking`: `logWork`, `roundTo` (15m), `idleGapMins`
  (90), `leadInMins` (30), `maxPerDay` (8h).

## Publish path — auto-detect, prefer in this order (never hard-block)
1. **Working `git push` → use it (preserves your real commits).** If push works (SSH key, HTTPS helper, or
   `gh`), push your branch — keeping your red-green-refactor commit trail (+ the commit-based worklog signal)
   — then open the PR via `gh` or a GitHub MCP. **This is the default whenever push creds exist.** If `gh` is
   the intended PR tool but missing/unauthed, **offer to set it up** (install via the pre-flight `fix` line,
   confirmation-gated, + `! gh auth login`) — normally already handled at `/start`.
2. **No push creds, but a GitHub MCP is connected → all-API (zero-setup fallback).** The MCP commits the
   changed files (`push_files` / Contents API) **and** opens the PR with its own token — no `gh`, no SSH key,
   no local creds. Tradeoff: the work lands as one/few **fresh API commits**, not your local commit history
   (fine if you squash-merge; otherwise prefer path 1).
3. **Neither → paste-mode.** Stage the branch + commits and hand over the exact push + PR-create command/URL.
   Never fail.

## Other fallbacks (degrade gracefully, never block)
- **No tracker MCP** → skip the transition/comment/worklog; tell the user what to do in paste-mode, and still
  open the PR.
- **No ticket key** → open the PR only; note that nothing was linked/transitioned.

## Anti-patterns
- ❌ Pushing or opening a PR without explicit OK; ever using `--force`.
- ❌ Treating a Jira comment or a status transition as "logged time" — the worklog is a separate
  `addWorklogToJiraIssue` call; verify it landed.
- ❌ Jira wiki markup (`h2.`, `{{}}`) or omitting `contentFormat:"markdown"` — it renders garbled.
- ❌ Shipping un-green work, or skipping the redaction check on third-party-visible text.
- ❌ Re-implementing this flow inside `/tdd` or elsewhere — always hand off here.

## Completion criteria
- [ ] Slice was green + summary ready before shipping; redaction-check run on PR/Jira text.
- [ ] Branch pushed (no `--force`) and PR opened into the correct base, linked to the ticket, with the
      verification summary as the body.
- [ ] Ticket moved to **In Review**; PR-link + criteria→test comment posted (markdown).
- [ ] Worklog logged at the **user-confirmed** time (or repo opted out) — confirmed it returned ok.
- [ ] Outcome reported (PR URL, status, worklog) — or the paste-mode commands handed over if a tool was absent.

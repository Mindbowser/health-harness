---
name: harness-questions
description: See and answer the open "I don't know yet" questions on the current ticket — the ones the build logged and left for you to ratify. Lists them and resolves each interactively; reconciles anything your answer changes.
argument-hint: "(none) — acts on the current branch's ticket"
---

The see-and-answer view for **open questions** (MBI-129) — the decisions the build hit that the acceptance
criteria didn't determine, logged and left `open` awaiting your ratification. This is the CLI-native
equivalent of clicking a PR link: it lists them and walks you through answering, right here.

## Process

1. **List the open questions** on the current branch's ticket:
   `node "…/bin/open-questions.js" list`
   - **None?** Say *"No open questions on `<ticket>` — nothing to ratify."* and stop. (On a keyless branch:
     *"No ticket on this branch."*)
   - Show them as **readable text** (id · `[AC]` · question · the agent's `assumed:` recommendation).

2. **Resolve each one via a structured popup** — an `AskUserQuestion` (header `Question`), the question shown
   as readable text above it, with options:
   - **"Accept: <recommendation>"** FIRST (one keypress — ratifies the guess the build already made),
   - the question's **explicit options** (if it has any, e.g. "exact" / "case-insensitive"),
   - **"Answer differently"** (free-text via the *Other* option — the editable path),
   - **"Skip for now"** (leave it open).
   On an answer, record it:
   `node "…/bin/open-questions.js" resolve <id> --answer "<their answer>" --by <their email>`
   Don't invent an answer — if they Skip, it stays open (and keeps gating the push).

3. **Reconcile what changed.** After resolving, run:
   `node "…/bin/open-questions.js" reconcile`
   - Any entry whose **answer differed** from the recommendation the code was built on is listed with the
     exact **files to revise**. For each, **offer to revise those files (and their tests) to match** and get
     the gate green — that's the code catching up to the ratified decision.
   - An answer that **matched** the recommendation needs no rework — it was already built that way.

4. **Close the loop.** Once every question is resolved (and any reconcile edits are green), tell them the
   **push gate is clear** — the open-questions wall won't block the ship anymore.

## Notes
- This only *reads and resolves* the ledger the build wrote; it never invents questions. If there's nothing
  logged, there's nothing to show — that's the common, healthy case.
- Answers are recorded against the ticket, so a resolved question is never re-asked.
- Prefer this over hand-running `open-questions.js` — but that CLI (`list` / `resolve` / `reconcile` /
  `count`) is always there for scripting.

## Completion criteria
- [ ] Listed the open questions (or confirmed there are none).
- [ ] Each was resolved via a consented popup (or explicitly skipped), the answer recorded.
- [ ] Reconcile run; any answer that diverged from the build had its files revised + gate green.
- [ ] Told the user whether the push gate is now clear.

---
name: to-issues
description: Break a PRD into independently-grabbable issues using vertical slices, with blocking order.
---

Break a PRD (or plan, or a set of Jira/Linear stories) into **issues**, each ideally one **vertical
slice**, with explicit blocking relationships so agents can work them in parallel. Phase 3 of the
Build Loop. Dev/Tech-lead-led — slicing is an architectural act.

**Confirm the sprint before writing.** Read `.mb-harness/current-sprint` and state: "Writing issues to
`.mb-harness/sprints/<sprint-id>/<feature-slug>/issues.md` (and pushing to the tracker) — correct?"
Wait for a yes/redirect; if the sprint is unset, have the user run `/sprint set <id>` first.

## Process

1. **Gather context** — the PRD from `/to-prd`, plus any existing tracker stories. If the input is
   BA/PM-authored stories, **reshape** them; don't re-elicit work the BA already did.
2. **Explore the codebase** (when one exists) to ground slices in the real architecture and spot
   prefactoring that should happen first.
3. **Draft vertical slices.** Each slice is a thin, complete path through *every* layer it touches
   (schema → API → UI → tests), independently demoable or verifiable. Split horizontal stories ("build
   the whole API") into vertical ones ("award points on lesson-complete, visible on the dashboard").
4. **Order with blockers.** Give each issue a **blocked-by** list. The result is a DAG, not a sequence
   — unblocked issues can run in parallel. Put genuine prefactoring first.
5. **Quiz the user** on the breakdown before publishing: titles, what each builds end-to-end, the
   blocking graph, and which stories each slice covers. Adjust on feedback.
6. **Publish** to the tracker in dependency order, each issue carrying: parent/PRD reference,
   "what to build" (end-to-end behavior), acceptance criteria, and blocked-by.

## Anti-patterns

- ❌ **Horizontal slices** — "all the database", then "all the API". No feedback until integration.
- ❌ A linear phase list (1→2→3→4) when issues could be a DAG — it forces one agent, kills parallelism.
- ❌ Publishing before the user has validated the breakdown.
- ❌ Embedding stale file paths or code snippets unless they come from a prototype documenting a decision.

## Completion criteria

- [ ] Every issue is a vertical slice (cuts through all layers it touches) and is independently verifiable.
- [ ] Every issue has acceptance criteria and a blocked-by list (a real DAG, not a chain).
- [ ] Prefactoring, if any, is sequenced first.
- [ ] The user approved the breakdown before publishing.
- [ ] Issues reference the PRD; the PRD can now be closed (avoid doc-rot).

Next: the agent picks unblocked issues and builds them with `/tdd`.

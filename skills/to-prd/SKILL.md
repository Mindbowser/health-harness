---
name: to-prd
description: Turn an alignment session into a disposable PRD — the destination document for the work.
---

Convert the shared design concept from `/align` into a **PRD that lives on the Jira epic** — so the
team actually sees it (the same way `/align` writes criteria onto the story). Any local copy is
disposable working notes, not the deliverable. Phase 2 of the Build Loop — and the **most skippable
one**: for a single ticket/bug there's no PRD at all.

> **Normally `/align` calls this for you** when you point it at an **Epic** — you don't run it by hand.
> Invoke it directly only if you're deliberately doing the PRD step alone.

## Who / when / where — and when to SKIP

- **Who:** the **PM/BA** (it's a product artifact).
- **When:** only for a **multi-story feature/epic** that needs a shared destination beyond per-ticket
  criteria. **SKIP it for a single ticket or a bug** — there, the acceptance criteria from `/align`
  (written onto the Jira ticket) ARE the spec; a separate PRD is redundant ceremony.
- **Where it lives:** the **durable home is the Jira epic** — write Problem/Solution/Decisions/Out-of-scope
  into the **epic description**, so the team actually sees it (just like `/align` writes criteria onto the
  story). A local `.health-harness/sprints/<sprint>/<feature>/prd.md` is at most a **gitignored working
  draft**, never the deliverable. A PRD nobody reads is pointless — Jira is where it's seen.

## Prerequisite

There must be a real alignment to capture. If you weren't part of an `/align` session and only have a
thin prompt, run `/align` first — do not invent a design concept from nothing.

**Confirm the sprint before writing.** Read `.health-harness/current-sprint` and state: "Writing the PRD
to `.health-harness/sprints/<sprint-id>/<feature-slug>/prd.md` — correct?" Wait for a yes/redirect; if the
sprint is unset, have the user run `/sprint set <id>` first. Don't file silently.

## Process

1. **Draft from the alignment**, not from your imagination. Every decision in the PRD should trace to
   something resolved during alignment.
2. **Use this structure:**
   - **Problem** — who has it, why it matters.
   - **Solution** — the approach, in plain language.
   - **User stories** — "As a … I can … so that …", each with acceptance criteria written in
     **plain language QA can test** (Given/When/Then observable behavior, not code/file references as the
     primary phrasing; keep any code ref as a secondary note). `bin/ac-readability.js` flags AC that read as
     code-only (MBI-106).
   - **Decisions** — the choices made during alignment (and the rejected alternatives, briefly).
   - **Out of scope** — explicit non-goals. Critical for definition of done.
   - **Compliance notes** — PHI/PII/regulated data touched + the repo's `compliance-profile`.
3. **Keep it summarizable, not exhaustive.** The PRD is a hint of the destination; the real work is in
   Slice + QA. Don't over-polish it.
4. **Write it to the Jira epic** so the team sees it + it's durable — show it, run `/phi-redaction-check`
   on the text, confirm once (outward write), then push via the tracker MCP. Keep a local draft only if
   genuinely useful; the **epic is the record**, and the draft is gitignored + closed after `/to-issues`.

## Anti-patterns

- ❌ Writing a PRD without a prior alignment (specs-to-code slop).
- ❌ Endless refinement. Past "captures the design concept", more polish is wasted — move to slicing.
- ❌ Omitting **out-of-scope** — without it, "done" is undefined and scope creeps.
- ❌ Leaving a stale PRD open after slicing (doc-rot misleads future agents).

## Completion criteria

- [ ] Every section present (Problem, Solution, Stories+acceptance, Decisions, Out-of-scope, Compliance).
- [ ] Every decision traces to the alignment.
- [ ] Out-of-scope is explicit.
- [ ] The PRD is **written to the Jira epic** (visible to the team); any local draft is gitignored + disposable.

Next: `/to-issues` to break this into vertical slices.

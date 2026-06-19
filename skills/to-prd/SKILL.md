---
name: to-prd
description: Turn an alignment session into a disposable PRD — the destination document for the work.
---

Convert the shared design concept from `/align` into a **PRD**: a destination document the team and
the agent point at. It is *disposable* — closed/archived once sliced into issues — so it never rots
into stale guidance. Phase 2 of the Build Loop.

## Prerequisite

There must be a real alignment to capture. If you weren't part of an `/align` session and only have a
thin prompt, run `/align` first — do not invent a design concept from nothing.

**Confirm the sprint before writing.** Read `.mb-harness/current-sprint` and state: "Writing the PRD
to `.mb-harness/sprints/<sprint-id>/<feature-slug>/prd.md` — correct?" Wait for a yes/redirect; if the
sprint is unset, have the user run `/sprint set <id>` first. Don't file silently.

## Process

1. **Draft from the alignment**, not from your imagination. Every decision in the PRD should trace to
   something resolved during alignment.
2. **Use this structure:**
   - **Problem** — who has it, why it matters.
   - **Solution** — the approach, in plain language.
   - **User stories** — "As a … I can … so that …", each with acceptance criteria.
   - **Decisions** — the choices made during alignment (and the rejected alternatives, briefly).
   - **Out of scope** — explicit non-goals. Critical for definition of done.
   - **Compliance notes** — PHI/PII/regulated data touched + the repo's `compliance-profile`.
3. **Keep it summarizable, not exhaustive.** The PRD is a hint of the destination; the real work is in
   Slice + QA. Don't over-polish it.
4. **Save it where issues can reference it**, and mark it for closure once `/to-issues` has run.

## Anti-patterns

- ❌ Writing a PRD without a prior alignment (specs-to-code slop).
- ❌ Endless refinement. Past "captures the design concept", more polish is wasted — move to slicing.
- ❌ Omitting **out-of-scope** — without it, "done" is undefined and scope creeps.
- ❌ Leaving a stale PRD open after slicing (doc-rot misleads future agents).

## Completion criteria

- [ ] Every section present (Problem, Solution, Stories+acceptance, Decisions, Out-of-scope, Compliance).
- [ ] Every decision traces to the alignment.
- [ ] Out-of-scope is explicit.
- [ ] The doc is saved and marked disposable (to close after `/to-issues`).

Next: `/to-issues` to break this into vertical slices.

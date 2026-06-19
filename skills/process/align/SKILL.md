---
name: align
description: A relentless interview to reach a shared design concept before any planning or code.
disable-model-invocation: true
argument-hint: "What are we building? (paste the idea, ticket, transcript, or prototype link)"
---

Interview the user relentlessly about every aspect of what they want to build, **until you reach a
shared design concept** — a mutual understanding of what we're building and why. The output is
*alignment*, not a plan and not a document. This is phase 1 of the Build Loop. Do NOT jump to a plan.

## Why this exists

The default failure mode of an agent is to eagerly produce a plan from a thin prompt — that's
"specs-to-code", where nobody actually shares the design concept and you get confident slop. Alignment
front-loads the disagreement: cheap now, expensive later. Whoever will build (human or agent) must
*inherit this alignment*, not just a doc written from it.

## Process

1. **Read what you were given** — the idea, ticket, Jira stories, transcript, Figma, or prototype.
   Identify the design tree: the major decisions and their dependencies.
2. **Interview one question at a time.** Walk down each branch of the design tree, resolving
   dependencies one by one. For **every** question, propose your recommended answer and a short why —
   the user confirms, corrects, or redirects. Never batch a wall of questions.
3. **Go deep and wide.** Ask about: the real user + their problem, scope boundaries (what's explicitly
   out), data and edge cases, integrations/constraints, success criteria, and what "done" means.
   Expect dozens of questions — keep going until the branches are resolved.
4. **Surface feasibility.** When a desire is technically expensive or risky, say so during alignment,
   not after. The dev's technical judgment belongs in this room.
5. **Healthcare check.** Note any PHI/PII/regulated-data the feature touches, and the repo's
   `compliance-profile`. Flag it as a constraint to carry into the PRD.
6. **Reflect the shared understanding back** in a few sentences and get explicit confirmation.

## Anti-patterns

- ❌ Producing a plan, spec, or PRD here. That's `/to-prd`, and only *after* alignment.
- ❌ Asking many questions at once, or asking without offering a recommended answer.
- ❌ Accepting vague scope ("make it good"). Pin down what's *out* of scope explicitly.
- ❌ Hiding technical cost to keep the conversation pleasant.

## Completion criteria

- [ ] Every major branch of the design tree has a resolved, confirmed answer.
- [ ] Scope boundaries (in AND out) are explicit and agreed.
- [ ] Success criteria / definition of done are stated.
- [ ] PHI/compliance exposure is identified (or confirmed none).
- [ ] The user has explicitly confirmed your reflected-back understanding.

When done, the natural next step is `/to-prd` to capture this alignment as a destination doc.

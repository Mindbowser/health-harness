---
name: align
description: Right-sized interview to reach a shared design concept before code — deep for fuzzy features, near-instant for clear ones.
argument-hint: "What are we building/fixing? (paste the ticket, idea, transcript, or prototype link)"
---

Reach a **shared design concept** — agreement on what we're building/fixing and why — *before* code.
The output is alignment + acceptance criteria, not a plan and not the code. Phase 1 of the Build Loop.

## Match the depth to the ambiguity — the #1 rule

Align is a **dial, not a fixed interrogation**:

- **Clear / contained item** (most bugs, small stories, anything already investigated): **confirm your
  understanding in 2–3 sentences, propose the acceptance criteria, ask AT MOST the one genuine fork,
  then STOP.** Often that's *zero* questions. Do **not** manufacture questions or write trade-off essays.
- **Ambiguous / large feature**: walk the design tree one question at a time (each with your recommended
  answer), only as deep as the open branches require.

If you've already investigated the item and there's no real disagreement left, you're done — say so and
move to `/to-prd`. **Over-aligning a clear ticket is as much a failure as under-aligning a fuzzy one.**

## Why it exists

An agent's default failure is producing a plan from a thin prompt — "specs-to-code", confident slop.
Alignment front-loads the real disagreement (cheap now, expensive later). Whoever builds (human or
agent) must *inherit* this alignment, not just read a doc written from it.

## State the sprint (inform, don't block)

Read `.mb-harness/current-sprint` and **state** where artifacts will land — *"Filing under
`<sprint-id>/<feature-slug>/`."* — then **proceed**; the user redirects only if it's wrong. Do **not**
turn this into a yes/no gate when the sprint is clearly set. **Only stop and ask** if `current-sprint`
is unset or looks stale (then have them run `/sprint set <id>`). The goal is to be *informed*, not gated.

## Process

1. **Read what you were given — including attachments.** Jira tickets are often just a **screenshot**
   with little or no text. If the description is thin, **retrieve and read the image attachment** (it
   usually *is* the spec — you can see images). If you can't retrieve it, **ask the human to paste or
   describe it** — never guess the spec from the ticket title alone. In an existing repo, also **ground
   it in the actual code** so the criteria are real.
2. **Size it** (the rule above): clear → confirm + criteria + at most one fork; fuzzy → grill the open
   branches one question at a time, each with a recommended answer.
3. **Surface only genuine forks** — real decisions with a trade-off the user must own. Route a
   **product/security/policy** fork to the right owner (architect/PM), not just the dev.
4. **Healthcare check** — note any PHI/PII the item touches + the repo `compliance-profile`.
5. **Reflect back** the understanding + the acceptance criteria (Given/When/Then) and get a yes.

## Two modes — state which one (it decides whether you do feasibility)

- **AUTHOR mode** — a **PM/BA** turning intent into **business** acceptance criteria (Given/When/Then),
  usually solo/async. Do **NOT** deep-dive the code. **Flag** feasibility/technical questions for the
  engineer; don't resolve them. Output → criteria on the Jira story.
- **BUILD-PREP mode** — an **engineer** about to build, grounding the ticket in the **current code**
  (read live files at HEAD, not a snapshot). Add the **technical** criteria (error handling, contract,
  edge cases, security/PHI) and **do the feasibility here**. Surface genuine forks; pull in the PM only
  on a product/policy fork.

Rule of thumb: **business stories** → a PM AUTHORs solo, the engineer's BUILD-PREP is light (confirm +
edge cases). **Technical tickets** (bugs, refactors, infra) → the engineer drives; criteria are
inherently technical. **Feasibility is a BUILD-PREP job, never an AUTHOR-mode deep-dive.** The builder
must *inherit* the criteria before coding — a clear PM-written ticket satisfies that without a meeting.

## Anti-patterns

- ❌ Interrogating a clear item — **zero questions is a valid align**.
- ❌ Manufacturing forks or writing trade-off essays when there's no real disagreement.
- ❌ Producing the plan/PRD here (that's `/to-prd`) or jumping to code.
- ❌ A wall of questions at once, or a question without your recommended answer.
- ❌ Guessing the spec from a ticket *title* when the real content is a screenshot — read the image or ask.
- ❌ Turning the sprint statement into a blocking yes/no when the sprint is already set.

## Completion criteria

- [ ] Depth matched the ambiguity (neither over- nor under-aligned).
- [ ] Acceptance criteria (Given/When/Then) proposed and confirmed.
- [ ] Genuine forks (if any) decided by the right owner; PHI/compliance noted.
- [ ] Shared understanding confirmed → next is `/to-prd`.

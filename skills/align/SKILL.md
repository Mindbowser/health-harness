---
name: align
description: Right-sized interview to reach a shared design concept before code — deep for fuzzy features, near-instant for clear ones.
argument-hint: "What are we building/fixing? (paste the ticket, idea, transcript, or prototype link)"
---

Reach a **shared design concept** — agreement on what we're building/fixing and why — *before* code.
The output is alignment + acceptance criteria, not a plan and not the code. Phase 1 of the Build Loop.

## Detect the level → run the right chain (the human picks the ITEM, not the command)

Point `/align` at any Jira item; **read its issue type** and run the right flow automatically — the user
should NOT have to know whether to call `/to-prd` or `/to-issues`. You orchestrate them (both are
model-invocable). Drive off the **item type** (it's in Jira); there's no logged-in role to read.

| Item type | What `/align` does (calls, in order) | Output |
|---|---|---|
| **Epic** | understand the feature → `/to-prd` (writes the PRD to the **epic**) → propose **child user stories** with criteria → on confirm, create them in Jira | epic PRD + stories |
| **Story** | understand → write criteria to the **story**; if multi-part, `/to-issues` to slice into sub-tasks | story criteria (+ sub-tasks) |
| **Bug / Task** | light, proportional understanding → write criteria to the **ticket** → "ready for `/tdd`" | ticket criteria; no PRD/slicing |

So one entry handles everything: epic gets the full PRD→stories breakdown; a bug gets just criteria.
The **level** decides the chain; **proportionality** (below) decides the depth within it.

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

## Resolve the sprint from the ticket (don't make the user set it)

When aligning a Jira item, **read its Sprint field** and reconcile with `.health-harness/current-sprint` —
don't ask the user to run `/sprint set` for the normal case:

- **`current-sprint` unset** → set it from the ticket's sprint and say *"sprint set to `<X>` (from the ticket)."*
- **match** → just state it (*"Filing under `<X>/<feature-slug>/`"*) and proceed — no question.
- **mismatch** (ticket's sprint ≠ `current-sprint`) → **surface + confirm**: *"this ticket is in `<X>`,
  but current-sprint is `<Y>` — switch to `<X>`?"*
- **ticket has no sprint** (backlog item) → say so; ask which sprint, or proceed unfiled if it's a one-off.

Infer + inform by default; **only stop to ask on a genuine mismatch or when it's truly missing.**

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
4. **Healthcare check → write the compliance criteria.** Note any PHI/PII the item touches + the repo
   `compliance-profile`. **If it touches ePHI (`hipaa`), the acceptance criteria MUST include the logging
   NFRs as Given/When/Then** — author them here so `/tdd` just builds-and-verifies them like any other
   criterion (don't defer to build time):
   - *audit:* "Given a user reads / writes / **is denied** access to patient record X → an audit entry is
     recorded (who · what + record id · when · where · outcome; **no PHI values**)."
   - *safe logs:* "Given an error on a PHI path → the log contains record ids/references, **never PHI**."
   AUTHOR states them as business/compliance criteria; BUILD-PREP makes them technical + testable. No-op
   for `none` (but `secrets` are never logged).
5. **Reflect back** the understanding + the acceptance criteria (Given/When/Then) and get a yes.
6. **Write the criteria where they belong — don't make the human run a second command:**
   - **AUTHOR mode (PM refining a ticket):** **update the Jira ticket** with the agreed Given/When/Then
     via the tracker MCP — show them, confirm once (it's an outward write), `/phi-redaction-check` the
     text first (no PHI/secrets in a ticket), then push. *This is the refinement output — the PM is done;
     no separate `/to-issues` needed.*
   - **BUILD-PREP mode (engineer):** save `align.md`; slicing into sub-tasks happens next in `/to-issues`.

## Two modes — state which one (it decides whether you do feasibility)

- **AUTHOR mode** — a **PM/BA** turning intent into **business** acceptance criteria (Given/When/Then),
  usually solo/async. Do **NOT** deep-dive the code. **Flag** feasibility/technical questions for the
  engineer; don't resolve them. Output → criteria on the Jira story.
- **BUILD-PREP mode** — an **engineer** about to build, grounding the ticket in the **current code**
  (read live files at HEAD, not a snapshot). Add the **technical** criteria (error handling, contract,
  edge cases, security/PHI) and **do the feasibility here**. Surface genuine forks; pull in the PM only
  on a product/policy fork.
  **It's a code-grounded reality check — and that's the point:** grounding the criteria in real code
  routinely uncovers **latent business/product decisions, false feasibility assumptions, and edge cases**
  the PM's criteria never resolved (e.g. grounding a bug-fix once surfaced a security fork + 2 feasibility
  assumptions that didn't hold).
  When it surfaces a **business/product** decision, **route it back to the PM/architect — or raise it in
  refinement/sprint planning — and do NOT start `/tdd` until it's resolved.** A dev must not silently
  decide a business question. Running BUILD-PREP *before* planning is a great way to surface these early
  — it sharpens "ready" and the estimate, so nothing crucial is discovered mid-build or in QA.

Rule of thumb: **business stories** → a PM AUTHORs solo, the engineer's BUILD-PREP is light (confirm +
edge cases). **Technical tickets** (bugs, refactors, infra) → the engineer drives; criteria are
inherently technical. **Feasibility is a BUILD-PREP job, never an AUTHOR-mode deep-dive.** The builder
must *inherit* the criteria before coding — a clear PM-written ticket satisfies that without a meeting.

**How the mode is picked (role → infer → ask):**
1. **Persisted role first.** Read `~/.health-harness/role` (set via `/role`): `pm` → default **AUTHOR**;
   `engineer` → default **BUILD-PREP**.
2. **Infer if no role.** Fresh idea / thin story, no build intent → AUTHOR; a concrete ticket you're
   about to build in a repo → BUILD-PREP.
3. **Ask if still unclear.** If the role is unset AND the item type doesn't decide it, **ask one
   question and confirm** ("Author business criteria (PM), or build-prep against the code (engineer)?"),
   then offer to persist it via `/role`.
4. **Announce it** at the start — *"Acting as **PM · AUTHOR mode**"* (or engineer/BUILD-PREP) — and note
   *"say 'as engineer' to switch."* Switching mid-item is a one-word override; `/role` changes the default.

Also read `.health-harness/project.json` (Jira coords, repos, stack) so you don't re-derive project context.

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
- [ ] For ePHI items: audit-logging + PHI-safe-logging are in the acceptance criteria (Given/When/Then), ready for `/tdd`.
- [ ] Ran the chain for the item's **level** — epic → PRD on the epic + child stories; story → criteria
      (+ slices if multi-part); bug/task → criteria → ready for `/tdd`. The user picked the item, not the
      commands; the result is visible **in Jira**, not a local file.

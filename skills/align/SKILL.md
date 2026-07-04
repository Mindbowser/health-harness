---
name: align
description: Right-sized interview to reach a shared design concept before code — deep for fuzzy features, near-instant for clear ones.
argument-hint: "<ticket/idea/link> [as pm | as engineer] — e.g. /align ACME-258 as author"
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

**Front-load the judgment points here.** Align is *the* place to surface the irreversible-and-uninferable
calls (taste, risk, scope, compliance) — the human is already deciding, so raising them now keeps the
later AFK build quiet. Phrase each genuine fork as a **judgment point** (CONTEXT.md): reserved opener
`Your call —`, name the **axis** (in an `AskUserQuestion` popup, the axis is the header chip — one of
**Taste · Risk · Scope · Compliance**), give the cost of each side, and recommend. Mechanical/inferable
choices are NOT forks — decide them and move on.

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
   **While you have the ticket, record its hierarchy + type/priority** (the switch-nudge keeps context for
   related work; type/priority power the dashboard's Bug/Story/Task/Epic + priority filter — and this is the
   ONLY place they can be captured, since the analytics backend can't reach Jira, every team using a different
   one): `node "${CLAUDE_PLUGIN_ROOT}/bin/issue-graph.js" set key=<KEY> parent=<parentKey|''> epic=<epicKey|''>
   links=<comma-keys|''> type=<issueType|''> priority=<priority|''>` — read parent/epic/links **and the issue
   type (Bug/Story/Task/Epic/Sub-task) and priority (e.g. P1/High)** from the issue you just fetched. Cached +
   reused; no extra fetch. (Merge semantics: pass only what you know; omitted fields are preserved.)
   **Also capture the status-transition stream (FASTER telemetry, deterministic — MBI-46):** fetch the issue
   with `expand=changelog` (you already have it open) + its transitions, write each raw response to a temp
   JSON file, and run `node "${CLAUDE_PLUGIN_ROOT}/bin/usage-log.js" emit-transitions <issue.json> <transitions.json>`
   (transitions file optional). The CLI derives the category map, accumulates it, de-dupes, and records
   `ticket_transition` events — metadata only. Safe to call on every read; no-op when nothing is new.
2. **Size it** (the rule above): clear → confirm + criteria + at most one fork; fuzzy → grill the open
   branches one question at a time, each with a recommended answer.
3. **Surface only genuine forks** — real decisions with a trade-off the user must own. Route a
   **product/security/policy** fork to the right owner (architect/PM), not just the dev.
3b. **Scale expectations — capture them for any collection feature (MBI-96).** If the item involves a list /
   pagination / search / feed / table, ask/record the **realistic and max item count + page size** and write
   them into the criteria (e.g. "handles ≥1000 items; paginates at 25"). This is what lets `/tdd` test at
   volume instead of N=3 (`bin/scale-hints.js` turns it into the boundary cases). Don't force it on
   non-collection work.
4. **Healthcare check → write the compliance criteria.** Note any PHI/PII the item touches + the repo
   `compliance-profile`. **If it touches ePHI (`hipaa`), the acceptance criteria MUST include the logging
   NFRs as Given/When/Then** — author them here so `/tdd` just builds-and-verifies them like any other
   criterion (don't defer to build time):
   - *audit:* "Given a user reads / writes / **is denied** access to patient record X → an audit entry is
     recorded (who · what + record id · when · where · outcome; **no PHI values**)."
   - *safe logs:* "Given an error on a PHI path → the log contains record ids/references, **never PHI**."
   AUTHOR states them as business/compliance criteria; BUILD-PREP makes them technical + testable. No-op
   for `none` (but `secrets` are never logged).
4a. **Cross-cutting concerns sweep → design them now, don't let the gate catch them late.** Run the concern
   registry on the item so recurring concerns (timezone/DST, audit, PHI-safe logging, **error handling**,
   **scale/pagination**, authz, i18n) are surfaced *at design time* and become acceptance criteria — not
   discovered at build or in prod:
   `node "${CLAUDE_PLUGIN_ROOT}/bin/concerns.js" "<one-line feature description>" --profile <profile>` →
   each triggered concern with a design prompt + whether it needs a test. For each hit, **author a
   Given/When/Then criterion** (this generalizes the healthcare check above and the timezone check in `/tdd`).
   Registry is extensible — add a concern in `bin/concerns.js`. `/tdd` re-checks and nudges for the tests.
4b. **Breaking-change + schema-safety check → confirm, then write criteria.** Before finalizing, ask: does
   this change an **existing contract** — a public API signature, an endpoint/route, a response shape, a
   removed/renamed field, an event payload, or a **DB schema**?
   - **If yes (breaking risk):** STOP and **confirm with the user** — *"this changes an existing contract;
     intended? who consumes it?"* — and write **backward-compatibility acceptance criteria**: additive-first
     / deprecate-don't-remove / version the change / keep old + new during transition. Record the signal:
     `node <health-harness>/bin/usage-log.js emit breaking_change kind=<api|schema|event> confirmed=true issueKey=<KEY>`.
   - **If it changes a DB schema (and the repo has a DB):** add **expand-contract** acceptance criteria —
     *add* the new column/table → backfill → switch reads/writes → drop the old in a **later** migration;
     migration tested **up *and* down**; run on **prod-shaped synthetic data** (never real PHI); reversible.
     Record: `... emit migration pattern=expand-contract issueKey=<KEY>`. **No DB in the repo → skip this
     entirely** (don't manufacture migration criteria). If a schema change is needed but the repo has **no
     migration layer**, flag it (`... emit migration_gap reason=no-migration-layer`) and tell the user to add
     one before schema work.
   - **No contract/schema impact → skip** (most slices). Don't invent breaking-change theater.
5. **Reflect back** the understanding + the acceptance criteria (Given/When/Then) as **readable
   multi-line text** (never crammed into popup option labels) and get a yes. This reflect-back is
   conversational — *don't* turn it into an `AskUserQuestion`; the structured popup (step 6) is only for
   the **decisions** (the outward write, the `/tdd` offer), not for reading back content.
6. **Write the criteria where they belong — don't make the human run a second command.**
   **Confirm the outward write as a structured popup, not free text** — apply the *structured-decision
   convention* (CONTEXT.md): an `AskUserQuestion` with **"Approve & write" FIRST** (so approving is one
   keypress), **"Edit"** (free-text via the *Other* option → revise → re-show → re-ask), and **"Skip"** —
   while the criteria preview stays **readable text above** the popup. Don't ask the obvious: if a step is
   inferable or reversible, just do it and say so in one line — a popup is for a genuine decision or an
   outward/irreversible action only, and the change must never *increase* the number of prompts.
   - **Also record the deterministic manifest (makes coverage machine-checkable, never guessed).** Give each
     Given/When/Then a stable `[AC-N]` id (keep it visible in the Jira prose too — e.g. `[AC-1] Given…`) and
     write the committed manifest with
     `node "/Users/pravinuttarwar/.claude/plugins/cache/mindbowser/health-harness/0.2.21/bin/criteria-coverage.js" write <KEY> '<json>'`
     where `<json>` is a JSON array of `{kind?, text}` (ids are assigned by position → `AC-1`, `AC-2`, …).
     This commits `.health-harness/criteria/<KEY>.json`, which `/tdd`'s gate and the `/ship` wall read to
     enforce that **every** criterion is pinned by a real test. Tag compliance criteria by `kind`:
     `"audit"` (ePHI), `"app-logging"`, `"timezone"`. A criterion you deliberately ship untested carries a
     `defer` reason (downgrades its push-block from DENY to ASK).
   - **AUTHOR mode (PM refining a ticket):** **update the Jira ticket** with the agreed Given/When/Then
     via the tracker MCP — show them, **confirm via the popup** (it's an outward write),
     `/phi-redaction-check` the text first (no PHI/secrets in a ticket), then push. Write **clean Markdown with
     `contentFormat:"markdown"`, never Jira wiki markup** (`h2.`/`{{}}`); keep it ticket-sized — bold
     labels + bullets, not big `#` headings (see `docs/jira.md` → *Formatting*). *This is the refinement
     output — the PM is done; no separate `/to-issues` needed.*
   - **BUILD-PREP mode (engineer):** the criteria **still belong in Jira — the kept spec** (per the completion
     criterion: *visible in Jira, not a local file*). Don't leave them only in `align.md`:
     - **Ticket has no criteria yet** (title-only, or no PM ever AUTHORed it — the solo-engineer case) → **push
       the agreed Given/When/Then to the ticket now:** show them, **confirm via the popup** (it's an
       outward write), `/phi-redaction-check` first, clean markdown (`contentFormat:"markdown"`). This is
       the same write AUTHOR mode does — being the engineer doesn't exempt you from recording the spec.
     - **A PM already AUTHORed business criteria** → append/confirm your **technical** criteria on the same ticket.
     Save `align.md` as the working note **under `.health-harness/sprints/` — it is dev-local and gitignored,
     NOT committed** (the kept record is Jira; only the criteria *manifest* at `.health-harness/criteria/<KEY>.json`
     is committed). Run `node "…/bin/local-ignores.js"` once so `.gitignore` excludes these working files (it's
     idempotent; `/start` also does it). `/to-issues` if multi-part. **Record the criteria in Jira FIRST
     (the popup above), and only THEN offer `/tdd` — as its own `AskUserQuestion`** ("Run /tdd" first /
     "Not yet"), never shown before the write is confirmed and never as an equal alternative to recording
     the spec. No criteria in the ticket ⇒ not ready to build.

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

**How the mode is picked (explicit → role → ASK → infer). Prefer asking once over guessing.**
0. **Explicit persona in the invocation wins** — for the run, overriding role/inference. Recognize a
   persona token in the args: **`as pm` / `as author` / `--author`** → AUTHOR; **`as engineer` / `as dev` /
   `as build-prep` / `--build-prep`** → BUILD-PREP. (e.g. `/align ACME-258 as author`.)
   **Dual-persona folks** (a senior who's both PM and builder): name the persona each time — or run
   **AUTHOR first** to write the business criteria, **then BUILD-PREP** on the same ticket to add the
   technical ones. Naming it explicitly never re-asks and doesn't change your persisted `/role` default.
1. **Persisted role next.** Read `~/.health-harness/role` (set via `/role`): `pm` → default **AUTHOR**;
   `engineer` → default **BUILD-PREP**. (If role is set, don't ask — just announce it.)
2. **Role unset → ASK once, then persist (don't guess).** If `~/.health-harness/role` is missing, **ask one
   question** ("Author business criteria (PM/BA), or build-prep against the code (engineer)?"), use the
   answer for this run, and **offer to persist via `/role`** so it's never asked again. Guessing the mode
   silently is wrong — confirm it once. (Onboarding via `/start` normally sets this already.)
3. **Infer only as a last resort** — if asking isn't possible (e.g. non-interactive). Then: fresh idea /
   thin story, no build intent → AUTHOR; a concrete ticket you're about to build in a repo → BUILD-PREP.
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
- ❌ Offering `/tdd` (or offering it as an *equal option* to "update the ticket") while the criteria still
  live only in `align.md` — **record them in Jira first** (confirmed), build second. The kept spec is the
  ticket, not a local file; no criteria in the ticket ⇒ not ready for `/tdd`.

## Completion criteria

- [ ] Depth matched the ambiguity (neither over- nor under-aligned).
- [ ] Acceptance criteria (Given/When/Then) proposed and confirmed.
- [ ] Genuine forks (if any) decided by the right owner; PHI/compliance noted.
- [ ] For ePHI items: audit-logging + PHI-safe-logging are in the acceptance criteria (Given/When/Then), ready for `/tdd`.
- [ ] Ran the chain for the item's **level** — epic → PRD on the epic + child stories; story → criteria
      (+ slices if multi-part); bug/task → criteria → ready for `/tdd`. The user picked the item, not the
      commands; the result is visible **in Jira**, not a local file.

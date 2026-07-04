# CONTEXT — shared vocabulary

One word, one meaning. Every skill in this repo uses these terms exactly as defined here. If a skill
needs a term not defined here, add it here rather than redefining it locally.

## The discipline

- **Mindbowser Health Harness** — Mindbowser's discipline for building software with AI agents, plus the
  healthcare safety guardrails that make it fast *and* safe. This repo *is* the harness.
- **Build Loop** — the five-phase method: Align → PRD → Slice → Build (AFK) → QA.
- **Harness engineer** — a Mindbowser engineer who works inside this discipline (the role we're
  growing every dev into).

## Build Loop terms

- **Align** — a relentless, one-question-at-a-time interview that produces a *shared design concept*
  between the humans and the implementing agent. The output is alignment, not a document. Skill: `/align`.
- **Design concept** — the shared mental model of what we're building and why (Fred Brooks' term). The
  thing alignment produces; the thing the builder must inherit.
- **PRD** — a disposable destination document (problem, solution, user stories, decisions, out-of-scope)
  summarized from the alignment. Closed/archived after slicing to avoid **doc-rot**. Skill: `/to-prd`.
- **Vertical slice** — a thin but complete path through *every* layer (schema → API → UI → tests) that
  is independently demoable/verifiable. The unit of work. The opposite of a **horizontal slice**.
- **Horizontal slice** — work scoped to one layer only (all the schema, then all the API, …). An
  anti-pattern: no feedback until everything integrates.
- **Issue** — one work unit on the tracker (Jira/Linear/local markdown), ideally one vertical slice,
  carrying acceptance criteria and a **blocked-by** list. Skill: `/to-issues`.
- **AFK** ("away from keyboard") — the phase where the agent builds unattended, picking unblocked
  issues and looping. Contrast with the human-in-the-loop phases (Align, Slice, QA).
- **QA** — fresh-context human review (tests → code → manual) where taste and acceptance are imposed.

## Judgment points — when the agent stops for the human

- **Judgment point** — a decision that needs a human's *values* (taste, risk tolerance, scope, or
  compliance), not correctness the agent can verify on its own. The agent **governs** the mechanical
  decisions and stops the human **only** here. The aim is *humans at judgment points, not gatekeepers at
  every step* — and the signal only works if it stays **scarce**. Interrupting for decisions the agent
  could have made trains the human to rubber-stamp, which defeats the whole point.

**1. The interrupt gate — stop ONLY if all three hold; otherwise proceed.**
- **Irreversible** — hard or expensive to undo later (schema, data-retention period, a shipped/public
  API shape, a migration). *Reversible → just do it.*
- **Not inferable** — the answer isn't in the alignment, the PRD, or the compliance profile; it needs a
  human value. *Inferable → infer it* (that's what Align + the profile are *for*).
- **Load-bearing now** — it blocks correct progress and can't wait. *Can wait → batch it (rule 3).*

  Fail any one → **don't interrupt.** This is what keeps the marker rare and meaningful.

**2. The phrasing — a reserved opener, used nowhere else.** When the gate passes, open with **`Your
  call —`**, then: name the **axis**, give the **cost of each side**, and **recommend**. Never spend this
  opener on mechanical/permission prompts — those stay terse and defaulted (*"Proceeding with X unless you
  stop me"*). The scarcity *is* the signal: the engineer learns that `Your call —` means *stop and
  govern*, and everything else just flows past.
  - **Axis (closed set, exactly one per question):** **Taste** · **Risk** · **Scope** · **Compliance**.
    In an `AskUserQuestion` popup the axis is the **header chip** (one chip per question, never the whole
    set). Keep the four fixed so the chip is readable at a glance — *Compliance* = slow down, *Taste* =
    quick gut call. Don't invent a fifth axis; a generic catch-all erodes the signal.

**3. Everything else — proceed + log, or batch to QA.** Reversible low-stakes calls (naming, file
  layout, retry counts, which existing helper): just make them, one terse line at most — no question.
  Deferrable taste calls (copy tone, error wording, ordering): collect silently and present as **one
  digest** at the next natural break (end of slice / QA) — *"here are the N defaults I picked; override
  any."* One review of N defaults beats N interrupts.

**Front-load to Align.** Foreseeable judgment calls belong in `/align`, where the human is already in
  judgment mode — not drip-fed during AFK build when they've context-switched away. If the agent finds
  itself wanting to ask mid-build, that's usually a sign alignment was thin; the question should have been
  raised at the front. Done right, AFK build trends toward *silence punctuated by one or two real calls*,
  with judgment clustered at the two human phases (**Align** and **QA**).

## Structured-decision convention — how the survivors get asked

A two-level gate: **ask only when it matters, and when you do, make it a clean click.** This is the
shared shape every skill uses for a decision or an outward/irreversible action (the reference
implementations are `ship` and `align`).

1. **Should it even be asked?** Obvious / inferable / reversible steps → **just do them and say so in one
  line** (no prompt). A prompt is justified only by a **genuine decision the user owns** *or* an
  **outward/irreversible action** (a Jira write, a push, a publish). Converting a confirmation to a popup
  must **never increase** the number of prompts — drop the ones that shouldn't exist first.
2. **If it survives → an `AskUserQuestion` popup, not free-text "type yes".** Approving is one keypress:
  list the **approve/proceed option FIRST** (the highlighted default), then **Edit** (free-text via the
  *Other* option → revise → re-render the preview → re-ask) and **Skip/Cancel**. Keep any **rich preview
  as readable text *above* the popup** — never cram multi-line content (criteria, PR bodies) into option
  labels. A genuine *judgment-point* fork is the same popup with the **axis as the header chip** (above);
  a routine outward-write confirm just needs Approve-first + Edit + Skip.

Reading content back for a yes (e.g. align's reflect-back of the criteria) is conversational text, **not**
a popup — the popup is for the *decision*, not the *content*.

## Engineering terms

- **Gate** — the repo's single one-command quality check (e.g. `pnpm verify` = **lint + typecheck +
  build + tests**). Must be fast and pass/fail; a **lint** failure fails the gate (a linter that isn't in
  the gate isn't enforced — `bin/lint-detect.js` checks this at onboard/scaffold). **Feedback loops are
  the quality ceiling.**
- **Feedback loop** — any tight pass/fail signal for the work in hand (tests, typecheck, lint, a curl
  script, a repro harness). Establishing one is prerequisite to AFK building.
- **Characterization test** — a test that pins down the *current* behavior of existing code so you can
  change it safely. The first thing you write on a brownfield codebase that lacks tests.
- **Smart zone / dumb zone** — an LLM reasons well early in a context window and degrades as it fills
  (~100k tokens is a useful marker). Size tasks to stay in the smart zone; prefer **clear-and-loop**
  (reset context, re-read state) over compacting a bloated conversation.
- **Deep module** — few files, small interface, rich internal behavior; easy for an agent to reason
  about. The opposite of **shallow modules** (many small files, tangled dependencies) which lose agents.

## Archetypes — the variable "front door"

The middle of the Build Loop is invariant; how a project is *born* changes where you enter and what
you must do first. From a developer's seat there are **two** front doors (`/start` picks one):

- **New repo (greenfield)** — started from MB's modifiable boilerplate. Enters at Align; the gate ships
  in the boilerplate. *Most common archetype.* Door: `/scaffold-from-boilerplate`.
- **Existing repo (brownfield)** — any repo that already has code: a customer's codebase, an old
  project, OR a Studio prototype handed over for productionizing (to the receiving dev it's just a repo
  with code + a handover doc to read as context). Comprehend it first, write a repo CLAUDE.md, and
  **HARD-GATE: establish a one-command feedback loop before any AFK build.** Respect its conventions,
  IP, and compliance — do not impose MB boilerplate. Door: `/onboard-existing-codebase`.
- **Requirements source** — orthogonal to the above: Jira/Linear stories, Figma, a prototype, or the
  code itself. An *input* to Align/Slice (ingest + reshape into vertical slices), not a separate workflow.

## Governance terms

- **Compliance profile** — a repo-level declaration (`hipaa` | `pci` | `gdpr` | `none`) that selects the
  redaction patterns and the checklist that apply. Set it at repo init.
- **PHI / PII** — protected health / personally identifiable information. Never emitted into code,
  tests, fixtures, logs, commits, or customer-facing artifacts — use synthetic data.
- **Redaction check** — the gate scanning anything customer-facing for PHI/PII, secrets, and other
  disallowed content before it leaves the repo. Skill: `/phi-redaction-check`.
- **Audit trail / audit log** — a tamper-evident, retained record of *who accessed or changed ePHI,
  when* (HIPAA audit controls, §164.312(b)). Stores references (user id, record id, action), **never
  PHI values**. Distinct from operational logs (see safe-logging — that keeps PHI *out*; this *records
  access*). Skill: `/audit-logging`.

## The `.health-harness/` config — one home per fact

Three files, split by how often they change. Skills **read these instead of re-deriving** (e.g. don't
re-query Jira for the project key every run).

- **`project.json`** — *durable* project facts. Written once by the front door (`/start` →
  onboard/scaffold), read by everyone after. Shape:
  ```json
  {
    "name": "Acme Patient Portal",
    "jira": { "projectKey": "ACME", "cloudId": "…", "site": "https://…atlassian.net" },
    "repos": [ {"name":"be","path":".","role":"backend"},
               {"name":"fe","path":"FE/…","role":"frontend","submodule":true} ],
    "stack": "Node/TypeScript",
    "git": { "baseBranch": "dev", "branchPattern": "<type>/<KEY>-<slug>", "prTarget": "dev" },
    "defaultBranch": "main",
    "timeTracking": { "logWork": true, "roundTo": "15m", "idleGapMins": 90, "leadInMins": 30, "maxPerDay": "8h" },
    "gate": "npm test",
    "productDoc": "docs/…",
    "figma": "<url or 'mcp'>"
  }
  ```
- **`compliance.json`** — the governance profile (see Governance terms). Separate, on purpose.
- **`current-sprint`** — *volatile*: ONLY the active sprint (id, name, dates). **Project/Jira coords do
  NOT belong here** — they go in `project.json`.

### Your role — user-level, persisted, separate from the project

- **`~/.health-harness/role`** (in your HOME, not the repo) holds **your** role: `pm` or `engineer`. Set via
  `/role`. It persists across all your sessions + projects and is **personal** (never committed). It sets
  `/align`'s default **mode** (pm → AUTHOR, engineer → BUILD-PREP). `/align` announces the active role and
  lets you switch (`/role <x>` or "as engineer"); if it's unset and unclear, `/align` asks + offers to persist.

**Git policy — what's committed vs ignored:**
- **Commit** (durable, team-shared): the repo `CLAUDE.md`, `.health-harness/project.json`, `.health-harness/compliance.json`.
- **Gitignore** (scratch/volatile): `.health-harness/sprints/` (the `align.md`/**`prd.md`**/`issues.md`) and
  `.health-harness/current-sprint`. The PRD is **disposable** — its durable form is the **Jira ticket
  criteria**, not a committed file. Don't commit working docs (doc-rot + clutters a client repo). The
  front door adds these ignore rules to `.gitignore`.

## Sprint terms

- **Sprint** — a time-boxed batch of many features. The tracker (Jira/Linear) owns the sprint + its
  stories; the harness keeps a thin local container at `.health-harness/sprints/<id>/` to file each
  feature's `align.md`/`prd.md`/`issues.md`. The **active sprint** is in `.health-harness/current-sprint`
  (set via `/sprint set`). `/align` always confirms which sprint it's filing under before writing.
- **Feature** — one coherent unit of work within a sprint = one Build Loop (`/align`→`/to-prd`→
  `/to-issues`). A sprint has several. **Align per feature, never one align for the whole sprint.**

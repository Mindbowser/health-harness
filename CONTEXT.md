# CONTEXT — shared vocabulary

One word, one meaning. Every skill in this repo uses these terms exactly as defined here. If a skill
needs a term not defined here, add it here rather than redefining it locally.

## The discipline

- **MB Health Harness** — Mindbowser's discipline for building software with AI agents, plus the
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

## Engineering terms

- **Gate** — the repo's single one-command quality check (e.g. `pnpm verify` = typecheck + build +
  tests). Must be fast and pass/fail. **Feedback loops are the quality ceiling.**
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

## The `.mb-harness/` config — one home per fact

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
    "gate": "npm test",
    "productDoc": "docs/…",
    "figma": "<url or 'mcp'>"
  }
  ```
- **`compliance.json`** — the governance profile (see Governance terms). Separate, on purpose.
- **`current-sprint`** — *volatile*: ONLY the active sprint (id, name, dates). **Project/Jira coords do
  NOT belong here** — they go in `project.json`.

### Your role — user-level, persisted, separate from the project

- **`~/.mb-harness/role`** (in your HOME, not the repo) holds **your** role: `pm` or `engineer`. Set via
  `/role`. It persists across all your sessions + projects and is **personal** (never committed). It sets
  `/align`'s default **mode** (pm → AUTHOR, engineer → BUILD-PREP). `/align` announces the active role and
  lets you switch (`/role <x>` or "as engineer"); if it's unset and unclear, `/align` asks + offers to persist.

**Git policy — what's committed vs ignored:**
- **Commit** (durable, team-shared): the repo `CLAUDE.md`, `.mb-harness/project.json`, `.mb-harness/compliance.json`.
- **Gitignore** (scratch/volatile): `.mb-harness/sprints/` (the `align.md`/**`prd.md`**/`issues.md`) and
  `.mb-harness/current-sprint`. The PRD is **disposable** — its durable form is the **Jira ticket
  criteria**, not a committed file. Don't commit working docs (doc-rot + clutters a client repo). The
  front door adds these ignore rules to `.gitignore`.

## Sprint terms

- **Sprint** — a time-boxed batch of many features. The tracker (Jira/Linear) owns the sprint + its
  stories; the harness keeps a thin local container at `.mb-harness/sprints/<id>/` to file each
  feature's `align.md`/`prd.md`/`issues.md`. The **active sprint** is in `.mb-harness/current-sprint`
  (set via `/sprint set`). `/align` always confirms which sprint it's filing under before writing.
- **Feature** — one coherent unit of work within a sprint = one Build Loop (`/align`→`/to-prd`→
  `/to-issues`). A sprint has several. **Align per feature, never one align for the whole sprint.**

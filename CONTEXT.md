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
you must do first.

- **Greenfield (from MB boilerplate)** — a new repo started from MB's modifiable boilerplate. Enters at
  Align; the gate ships in the boilerplate. *Most common archetype.*
- **Studio handover** — a Mindbowser Studio prototype handed to engineering to productionize. Enters at
  Slice (alignment already happened in Studio); ingest the handover doc + spec; flag faked parts.
- **Brownfield (customer codebase)** — the customer's existing repo. Comprehend it first, write a repo
  CLAUDE.md, and **HARD-GATE: establish a one-command feedback loop before any AFK build.** Respect
  their conventions, IP, and compliance — do not impose MB boilerplate.
- **Requirements source** — orthogonal to the above: Jira/Linear stories, Figma, a prototype, or the
  code itself. An *input* to Align/Slice (ingest + reshape into vertical slices), not a separate workflow.

## Governance terms

- **Compliance profile** — a repo-level declaration (`hipaa` | `pci` | `gdpr` | `none`) that selects the
  redaction patterns and the checklist that apply. Set it at repo init.
- **PHI / PII** — protected health / personally identifiable information. Never emitted into code,
  tests, fixtures, logs, commits, or customer-facing artifacts — use synthetic data.
- **Redaction check** — the gate scanning anything customer-facing for PHI/PII, secrets, and other
  disallowed content before it leaves the repo.

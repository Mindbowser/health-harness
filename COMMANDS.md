# Commands — who does what, when (mapped to Agile/SDLC)

> The harness **does not replace Scrum/Agile** — every command slots into a ceremony you already run.
> This is the day-one reference: which command, in which ceremony, who drives it, what it produces.

## View A — Command reference (with SDLC/Agile phase)

| # | Command | Agile ceremony / SDLC phase | Frequency | Who drives | How invoked | What it does | Produces |
|---|---|---|---|---|---|---|---|
| 1 | `/start` | Project onboarding / *Inception* | Once per repo | Engineer/lead | **type** | Detect new vs existing repo, ensure compliance profile, route to a front door | routes to #2 or #3 |
| 2 | `/scaffold-from-boilerplate` | Project onboarding / *Inception* | Once (new repo) | Engineer/lead | agent (via `/start`) | Clone MB boilerplate, wire the gate, set the profile | a ready new repo |
| 3 | `/onboard-existing-codebase` | Project onboarding / *Inception* | Once (existing repo) | Engineer | agent (via `/start`) | Read repo → write `CLAUDE.md`; **confirm/create a test gate (hard gate)** | repo `CLAUDE.md` + gate |
| 4 | `/compliance-profile` | Project onboarding / *Inception* | Rare | Engineer/lead | agent (auto) | Declare `hipaa`/`pci`/`gdpr`/`none` | `compliance.json` |
| 5 | `/sprint set <id>` | **Sprint planning** | Once per sprint | PM / scrum master | **type** | Record the active sprint | `current-sprint` |
| 6 | `/import-issues` | **Backlog refinement** → *Requirements* | Per sprint | PM or Engineer | agent (auto) | Pull the sprint's tickets from Jira (lean), group, flag thin ones | done-vs-pending list |
| 7 | `/align <ticket>` | **Backlog refinement** (PM+Eng) / start of dev (Eng) → *Requirements→Design* | Per feature/story | Refinement: **PM+Eng** · Pick-up: **Eng** | agent or type | Shared understanding + **acceptance criteria** (proportional) | `align.md` + criteria |
| 8 | `/to-prd` | **Backlog refinement** → *Design* | Per feature | PM/BA (or Eng) | agent (auto) | Alignment → short destination doc | `prd.md` |
| 9 | `/to-issues` | **Sprint planning** → *Design / task breakdown* | Per feature | Engineer / tech-lead | agent (auto) | Slice into **vertical slices**; push criteria + per-repo sub-tasks to Jira | Jira sub-tasks + `issues.md` |
| 10 | `/tdd` | **Sprint execution (daily)** → *Implementation+Testing* | Per task | **Engineer + AI** | agent (auto) | Failing test → minimal code → refactor → gate green | code + tests |
| 11 | `/phi-redaction-check` | **Code review / pre-merge** → *Testing/Security* | Per PR / demo | Engineer (ideally CI/hook) | agent (auto) | Scan for PHI/PII/secrets; **block** on a hit | pass / block |
| 12 | `/safe-logging` | Sprint execution → *Implementation (NFR)* | As needed | Engineer + AI | agent (auto) | Logs carry references, never PHI | PHI-safe logging |
| 13 | `/audit-logging` | Sprint execution → *Implementation (compliance NFR)* | As needed | Engineer + AI | agent (auto) | Record who/what/when accessed ePHI | audit trail |
| 14 | `/writing-great-skills` | **Retrospective** → *Continuous improvement* | Rare | Skill author | **type** | The authoring contract for a good skill | a well-formed skill |

*"type" = a human types it; "agent (auto)" = the AI can invoke it in-flow (you can also type it).*

## View B — The Agile cadence (ceremony by ceremony)

| Agile ceremony | SDLC phase | Commands | Who | Output |
|---|---|---|---|---|
| **Project onboarding** (pre-sprint, one-time) | Inception / Setup | `/start` → `/scaffold` or `/onboard` + `/compliance-profile` | Engineer/lead | repo is agent-ready: gate + profile + `CLAUDE.md` |
| **Backlog refinement / grooming** | Requirements → Design | `/import-issues` → `/align` (refinement) → `/to-prd` | **PM/BA + Engineer** | thin tickets become **ready** stories with acceptance criteria |
| **Sprint planning** | Planning / Design | `/sprint set` → commit refined stories → `/to-issues` | PM + Engineer/tech-lead | sprint backlog = **vertical slices** with blocking, in Jira |
| **Sprint execution (daily)** | Implementation + Testing | `/align` (pick-up, if a ticket is still thin) → `/tdd` (+ `/safe-logging`, `/audit-logging`) | **Engineer + AI** | working slices, tests, gate green |
| **Code review** | Quality gate / Security | PR + `/phi-redaction-check` | Engineer (reviewer) | merged, leak-free code |
| **QA / acceptance** | Testing | verify the **Given/When/Then** criteria in the app | **QA + PM** | sign-off |
| **Sprint review / demo** | — | demo the slices (each is demoable) | PM + client | client acceptance / feedback |
| **Release** | Deployment | CI/CD + `/phi-redaction-check` + audit check | Platform/DevOps | shipped |
| **Retrospective** | Maintenance / Improvement | `/writing-great-skills` (improve a skill from real friction) | team | a better harness next sprint |

## The one mental model

```
ONBOARDING (once)      →  /start → scaffold|onboard → compliance-profile
─────────────────────────────────────────────────────────────────────────
EACH SPRINT:
  Sprint planning      →  /sprint set
  Refinement (PM+Eng)  →  /import-issues → /align → /to-prd → /to-issues   ← stories get acceptance criteria
  Daily dev (Eng+AI)   →  /tdd  (+ safe-logging, audit-logging)            ← AI writes, engineer judges
  Code review          →  PR + /phi-redaction-check
  QA                   →  verify acceptance criteria
  Review/demo          →  demo
  Release              →  deploy
  Retro                →  improve a skill
```

The harness only *adds a command at two ceremonies* you already run — **refinement** (`/align` → criteria)
and **daily dev** (`/tdd`). Everything else (planning, review, QA, demo, retro) is your normal Agile,
with a governance gate (`/phi-redaction-check`) at the edges.

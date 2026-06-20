# Multi-repo work (FE + BE + infra)

Most real features span more than one repo. The harness handles this with one rule:

> **Features are cross-repo; code is per-repo.**
> `/align` `/to-prd` `/to-issues` `/sprint` run at the **workspace** (feature) level.
> `/tdd` + governance (`compliance-profile`, `phi-redaction-check`, `safe-logging`, `audit-logging`)
> run **inside each repo**, because that's where the gate and the PHI live.

A feature ("patient can book a telehealth visit") has *one* design concept — so you align on it
**once**, not once per repo.

## Workspace layout

Clone the repos side-by-side under a parent workspace dir and run Claude Code from the workspace root
(it can see all repos):

```
acme-workspace/
  .health-harness/                       # cross-repo feature + sprint artifacts
    current-sprint
    sprints/Sprint-42/book-visit/
      align.md  prd.md  issues.md  api-contract.md
  acme-frontend/   # own repo · own .health-harness/compliance.json · own gate (npm test, etc.)
  acme-backend/    # own repo · compliance.json = hipaa · own gate
  acme-infra/      # own repo
```

Install the harness plugin at the workspace (for planning skills) **and** in each child repo (for
build + governance). Each child repo declares its **own** `compliance-profile` (the BE that holds PHI =
`hipaa`; infra maybe just `secrets`).

## Where each step runs

| Step | Where | Notes |
|---|---|---|
| `/sprint`, `/align`, `/to-prd`, `/to-issues` | **workspace root** | one feature = one alignment, even though it spans repos. Artifacts live in the workspace `.health-harness/`. |
| `/tdd` | **inside each repo** | that repo's one-command gate + compliance profile apply. |
| governance checks | **inside each repo** | redaction/audit/safe-logging where the code is (usually BE). |

Do **not** run `/align` separately per repo — that re-fragments the design concept (the cross-repo
telephone game).

## The make-or-break artifact: the API/interface contract

In a polyrepo, the **contract between FE↔BE (and infra deps) is the seam** that lets the repos be built
in parallel. Pin it down during `/align`/`/to-prd` as `api-contract.md`. It becomes **contract tests at
the boundary** — the feedback loop *across* repos. Without it, FE and BE block on each other constantly.

## Stories & slicing across repos

- BA/PM write **feature/behavior stories** (end-to-end, user-facing — "book a visit"), not "build the
  booking API". See `docs/jira.md` for the tracker round-trip.
- `/to-issues` reshapes each into **vertical slices** (still end-to-end), then splits each slice into
  **per-repo sub-tasks** with **cross-repo blocking**: `BE: POST /visits` → `FE: booking form wiring`;
  `infra: provision queue` → `BE: deploy`.
- A slice is **done** when the behavior works **end-to-end across repos** (demoable), verified against
  the contract tests — not when one repo's task merges.

## Monorepo aside

If you get to choose for a *new* build, a **monorepo** makes agentic vertical slices much easier — one
gate, one context window, natural slices, no cross-repo blocking. The workspace pattern above is how we
bridge **existing** polyrepo setups; worth flagging to clients starting fresh.

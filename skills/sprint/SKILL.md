---
name: sprint
description: Set or show the active sprint — the container the Build Loop files its align/PRD/issue artifacts under.
disable-model-invocation: true
argument-hint: "set <sprint-id> | status | (blank = show current)"
---

Manage the **active sprint** for this repo. A sprint groups many features; each feature runs its own
Build Loop (`/align` → `/to-prd` → `/to-issues`). This skill records *which* sprint is active so those
loops file their artifacts in the right place — and so you can see the sprint's progress at a glance.
Jira/Linear stays the system of record for stories; this is a thin local organizing container.

## Commands

- **`/sprint set <id>`** — set the active sprint (e.g. `Sprint-42`, `2026-S12`). Writes the id to
  `.mb-harness/current-sprint` and creates `.mb-harness/sprints/<id>/`. Run this once when a sprint starts.
- **`/sprint`** or **`/sprint status`** — show the active sprint and list its features with the loop
  stage each has reached (align / prd / issues / building), by reading `.mb-harness/sprints/<id>/`.

## Layout it manages

```
.mb-harness/
  current-sprint                 # the active sprint id (one line)
  sprints/<id>/<feature-slug>/
    align.md                     # the shared design concept (from /align)
    prd.md                       # the destination doc (from /to-prd)
    issues.md                    # the vertical slices (from /to-issues; also pushed to the tracker)
```

## Process (for `set`)

1. Write the id to `.mb-harness/current-sprint` (overwrite any previous).
2. Create `.mb-harness/sprints/<id>/` if absent.
3. Confirm back: "Active sprint is now **<id>**. New `/align` sessions will file under it."

## Anti-patterns

- ❌ Treating the local sprint folder as the source of truth. Jira/Linear owns the stories; this just
  organizes the harness's working artifacts and pushes issues back to the tracker.
- ❌ One giant `/align` for the whole sprint. Align per feature; the sprint holds many.

## Completion criteria

- [ ] `.mb-harness/current-sprint` holds the active sprint id.
- [ ] `.mb-harness/sprints/<id>/` exists.
- [ ] `status` lists each feature and its current loop stage.

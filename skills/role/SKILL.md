---
name: role
description: Set or show your harness role (PM/BA or Engineer). Persists across sessions; sets align's default mode.
disable-model-invocation: true
argument-hint: "pm | engineer | (blank = show current)"
---

Set or show **your** role. It **persists across all your sessions and projects** and tells `/align`
which **mode** to default to — so you're not asked every time. It's a personal preference, stored at
**user level** (`~/.health-harness/role`), never in the project repo.

## What the roles mean

| Role | `/align` default **mode** | What you do |
|---|---|---|
| **pm** (PM/BA) | **AUTHOR** | turn intent into **business** acceptance criteria; flag feasibility for engineers; don't deep-dive code |
| **engineer** (Dev / Tech-lead) | **BUILD-PREP** | ground in the **code**, write **technical** criteria, do feasibility, then build |

(QA verifies the criteria in the running app — no align mode.)

## Commands

- `/role` → show the current role (reads `~/.health-harness/role`).
- `/role pm` or `/role engineer` → set it and persist to `~/.health-harness/role`.

## How it's used (and switched)

- **Item type still wins the chain.** An Epic gets PRD + child stories regardless of role; the role only
  sets the default **mode** (AUTHOR vs BUILD-PREP) when the item type alone doesn't decide (e.g. a Story
  a PM is authoring vs one an engineer is build-prepping).
- **`/align` announces it** at the start — *"Acting as PM · AUTHOR mode"* — and tells you how to switch.
- **Switch anytime:** `/role engineer`, or just say *"as engineer"* / *"as PM"* mid-`/align` (that
  overrides for the current item; `/role` changes your persisted default).
- **If it's still unclear** (role unset AND item type ambiguous), `/align` **asks one question and
  confirms**, then offers to persist your answer via `/role`.

## Completion criteria

- [ ] `~/.health-harness/role` holds `pm` or `engineer`.
- [ ] The active role was shown back to the user.

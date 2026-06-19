---
name: start
description: Start here — detect the project archetype (new / existing / Studio handover) and route to the right front door.
disable-model-invocation: true
argument-hint: "What are we doing? (optional)"
---

The single entry point. Run this first in any repo. It figures out **which archetype** you're in and
sends you through the correct front door — so nobody has to remember whether to scaffold, onboard, or
ingest a handover. It also makes sure the compliance profile is set, which every path needs.

## Process

1. **Detect the archetype** from the working directory:
   - **Empty / no source** (just `.git`, maybe a README) → **greenfield**.
   - **Has a Studio handover** (`handover.md` + `spec.json`, or a Studio marker) → **Studio handover**.
   - **Has existing source code** (any stack) → **brownfield**.
2. **Confirm with the user** — state the detected archetype and why; let them correct it. Never route
   blind (a near-empty repo might still be a brownfield clone mid-setup).
3. **Ensure the compliance profile is set.** If `.mb-harness/compliance.json` is missing, run
   `/compliance-profile` (default `hipaa`). Every archetype needs this before work starts.
4. **Route to the front door:**

   | Archetype | Front door |
   |---|---|
   | Greenfield (new repo) | `/scaffold-from-boilerplate` |
   | Existing / customer repo | `/onboard-existing-codebase` |
   | Studio prototype → productionize | `/from-studio-handover` *(not built yet — until then, treat as brownfield: `/onboard-existing-codebase` and read the prototype's `handover.md`/`spec.json` as context)* |

5. **Hand off.** Once the front door's completion criteria are met, the project enters the Build Loop at
   `/align`. The loop is identical for every archetype from there.

## Anti-patterns

- ❌ Routing without confirming the detected archetype.
- ❌ Skipping the compliance profile because "we'll set it later".
- ❌ Sending an existing/customer repo to `/scaffold-from-boilerplate` (wrong door — it's brownfield).

## Completion criteria

- [ ] The archetype is detected AND confirmed by the user.
- [ ] `.mb-harness/compliance.json` exists (default `hipaa`).
- [ ] The correct front-door skill has been invoked.

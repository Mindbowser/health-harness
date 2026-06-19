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

1. **Detect the archetype** from the working directory — two cases:
   - **Empty / no source** (just `.git`, maybe a README) → **new repo (greenfield)**.
   - **Has existing source code** (any stack) → **existing repo**.
2. **Confirm with the user** — state the detected archetype and why; let them correct it. Never route
   blind (a near-empty repo might still be an existing clone mid-setup).
3. **Ensure the compliance profile is set.** If `.mb-harness/compliance.json` is missing, run
   `/compliance-profile` (default `hipaa`). Both paths need this before work starts.
4. **Route to the front door:**

   | Archetype | Front door |
   |---|---|
   | New repo | `/scaffold-from-boilerplate` |
   | Existing repo (incl. a handed-over project that already has code) | `/onboard-existing-codebase` |

5. **Hand off.** Once the front door's completion criteria are met, the project enters the Build Loop at
   `/align`. The loop is identical for both archetypes from there.

> A project handed over with code already in it arrives, to you, as an **existing repo** — take the
> existing-repo door and read any included docs/spec as context. There's no separate path to learn.

## Anti-patterns

- ❌ Routing without confirming the detected archetype.
- ❌ Skipping the compliance profile because "we'll set it later".
- ❌ Sending an existing repo to `/scaffold-from-boilerplate` (wrong door — it's the existing-repo path).

## Completion criteria

- [ ] The archetype is detected (new vs existing) AND confirmed by the user.
- [ ] `.mb-harness/compliance.json` exists (default `hipaa`).
- [ ] The correct front-door skill has been invoked.

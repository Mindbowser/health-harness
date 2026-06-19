# MB Health Harness

> Mindbowser's discipline for building software *with* AI agents — packaged as Claude Code skills,
> installed in every project, improved by everyone.

A **harness** is a safety rig: it's what lets you move fast on dangerous terrain without falling.
That's the whole idea here. Shipping AI-built software in **healthcare** is dangerous terrain —
PHI, HIPAA, client IP, regulated data. The MB Health Harness is the set of guardrails + a repeatable
workflow that let a Mindbowser engineer move *fast* with agents and *not fall*: a tight feedback-loop
gate, compliance profiles, a redaction check, and a disciplined build loop.

This repo is a [Claude Code](https://claude.com/claude-code) **plugin**. Install it once and every
engineer gets the same skills (`/align`, `/to-prd`, `/to-issues`, `/tdd`, …) and the same standards.

## The Build Loop (the method)

| Phase | Who | What |
|---|---|---|
| **1. Align** (`/align`) | BA/PM + Dev | A relentless interview until everyone (and the agent) shares the design concept. Output is *alignment*, not a doc. |
| **2. PRD** (`/to-prd`) | BA/PM | Turn the alignment into a disposable destination doc. |
| **3. Slice** (`/to-issues`) | Dev/Tech-lead | Break it into **vertical slices** (schema→API→UI→tests), not horizontal layers. |
| **4. Build (AFK)** (`/tdd`) | Agent (Dev oversees) | TDD red-green-refactor, run the gate, loop until done. |
| **5. QA** | Dev + BA/PM | Fresh-context review + manual QA. Where human taste is imposed. |

**The middle of the loop is invariant; the *front door* varies by archetype** — greenfield from MB
boilerplate, a Studio prototype to productionize, or a customer's existing codebase. See `CONTEXT.md`.

## Non-negotiable principles

1. **Feedback loops are the quality ceiling.** No one-command gate → no good agent output.
2. **Vertical slices, never horizontal.** Demoable at every step.
3. **TDD is mandatory for AFK work.** It stops agents faking tests.
4. **Stay in the smart zone.** Small tasks; clear-and-loop over compacting; tiny system prompts.
5. **Own your planning stack.** Observability over the whole flow, not a black box.
6. **Deep modules.** Design interfaces, delegate implementations.
7. **Human QA is where taste lives.** Don't automate the idea, the QA, and the research all away.
8. **The harness is the healthcare differentiator.** Compliance + redaction guardrails are not
   overhead — they're what let us ship fast *and* safely. See `skills/governance/`.

## Install

Add this plugin to a repo's Claude Code config (or clone it and reference the skills dir). Once
installed, the skills auto-discover — type `/align` to start, or let the agent invoke `/tdd`,
`/to-issues`, etc. on its own.

```bash
# clone alongside your project
git clone https://github.com/pravinuttarwar/mb-harness.git
```

**Just type `/start`.** It detects whether you're in a new repo, an existing/customer repo, or a Studio
handover, sets the compliance profile, and routes you to the right front door — so you don't have to
pick. (Adding it to an existing/old repo specifically? The one-pager: **`docs/add-to-existing-repo.md`**.)
Works on any stack; it won't rewrite your code.

(Distribution mechanics — plugin reference vs. `setup-mb-harness` — are evolving; see `docs/authoring.md`.)

## Structure

```
.claude-plugin/plugin.json   # discovery manifest
CLAUDE.md                    # org-wide agent instructions (read by every agent here)
CONTEXT.md                   # shared vocabulary — single source of truth for terms
docs/authoring.md            # how to write a good skill
skills/
  process/                   # the Build Loop — stack-agnostic, install everywhere
    align/ to-prd/ to-issues/ tdd/
  governance/                # healthcare differentiator (compliance-as-skills) — coming
  authoring/
    writing-great-skills/    # the meta-skill: how to write skills here
```

## Contributing a skill

Read `skills/authoring/writing-great-skills/SKILL.md` first, then `docs/authoring.md`. Every skill is
reviewed against that meta-skill (checkable criteria, no duplication, explicit anti-patterns) and
dog-fooded once before merge.

## Credit

The discipline is adapted from **Matt Pocock / AI Hero**'s harness-engineering work and his public
skills library ([`github.com/mattpocock/skills`](https://github.com/mattpocock/skills)). We fork the
*discipline*, not the library — the content, vocabulary, gates, and healthcare/PHI governance are
Mindbowser's. Thank you, Matt.

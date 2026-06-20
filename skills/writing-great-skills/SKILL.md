---
name: writing-great-skills
description: How to author a skill for the Mindbowser Health Harness — structure, frontmatter, completion criteria, anti-patterns.
disable-model-invocation: true
---

Use this when writing or reviewing a skill in this repo. A skill turns a stochastic agent into a
**predictable** one: it should follow the *same process* every time (not produce identical output).
Adapted from Matt Pocock's `writing-great-skills`.

## The one rule: predictability

A skill exists to extract a reliable methodology from a model. If two runs of the same skill follow
different processes, the skill has failed — even if both outputs are fine. Optimize for *process*
reproducibility, not output sameness.

## Anatomy

One directory per skill, kebab-case, containing `SKILL.md` plus optional supporting `.md` files
(detailed methods, glossaries, templates). The directory name = the skill name = the invocation.

### Frontmatter

```yaml
---
name: <kebab-case-name>            # = the directory name; what /name invokes
description: <one line>            # FRONT-LOAD the trigger verb; this is how the agent discovers it
disable-model-invocation: true     # true = user types /name only; omit/false = agent can auto-invoke
argument-hint: "<text>"            # optional: shown to the user when they invoke it
---
```

- **Model-invoked** (omit `disable-model-invocation`): the description is visible to the agent, so it
  can discover and chain the skill. Use for skills that are frequently useful (`tdd`, `to-issues`).
- **User-invoked** (`disable-model-invocation: true`): hidden from the agent's context; a human types
  it. Use for niche skills or ones that need human judgment to start (`align`, `handoff`).

### Body

1. **Opening line** — one sentence: what this skill does and when.
2. **Wrong-tool guard (self-routing)** — when the skill is **likely to be misused**, open with a short
   *"if instead it's X, this is the wrong command — use `/Y`"* and **stop**. A skill invoked in the wrong
   situation should redirect, not execute pointlessly (e.g. `/to-issues` on a single bug → "skip to
   `/tdd`"; `/scaffold-from-boilerplate` on an existing repo → "use `/onboard-existing-codebase`").
3. **Numbered steps** — the process, each with a **checkable, exhaustive completion criterion** (the
   agent can verify it's done with no ambiguity).
4. **Anti-patterns** — an explicit "do NOT do this" section. This is where most of the value is.
5. **Reference** — definitions, examples; push detail into supporting files (progressive disclosure).

## Completion criteria — checkable and exhaustive

Every step states how the agent knows it's done. "Write good tests" is uncheckable. "Each public
behavior has a test that fails before the code and passes after" is checkable. Exhaustive = all the
work is covered, so the agent can't stop early ("premature completion").

## Failure modes to design out

- **Premature completion** — the checklist lets the agent stop too early. Fix: exhaustive criteria.
- **Duplication** — the same guidance in two places drifts. Fix: single source of truth; link, don't copy.
- **Sediment** — stale lines accumulate. Fix: prune anything that no longer changes behavior.
- **Sprawl** — the SKILL.md grows unfocused. Fix: move detail to supporting files.
- **No-ops** — lines that don't change what the agent does. Fix: delete them.

## House rules for this repo

- Define shared terms in `CONTEXT.md`, not in the skill — reference them.
- Reuse **leading words** (the trigger verb/phrase) consistently across the description and steps.
- Healthcare governance is not optional: if a skill emits anything customer-facing, it must respect the
  repo's `compliance-profile` and route through the redaction check.
- **Docs-sync gate — keep the harness repo's `README.md` in step with the feature.** *(Scope: developing
  the harness itself — not the consumer repos it runs in; those keep their own `CLAUDE.md` current
  instead.)* Any change that adds or alters a user-facing harness feature — a new/edited skill, a
  hook/wall rule, a `bin/` tool, or a flow/lifecycle change — **MUST update this repo's `README.md` in the
  same change**, and **its flow diagram** (the mermaid + the Build Loop table) **if the flow or lifecycle
  changed**. Bump the version. A feature change that leaves the README or diagram stale is **incomplete** —
  don't merge it.
- Before merge: validate against this skill, and **dog-food the skill once** on a real task.

## Completion criteria for *this* skill (writing one)

- [ ] Frontmatter has `name` + a trigger-verb-first `description`; invocation type is deliberate.
- [ ] Every step has a checkable, exhaustive completion criterion.
- [ ] There is an explicit anti-patterns section.
- [ ] No concept is duplicated from `CONTEXT.md` or another skill (linked instead).
- [ ] No no-op lines; detail beyond the core is in supporting files.
- [ ] **Docs-sync:** if this added/changed a user-facing feature, `README.md` (and the flow diagram + Build Loop table, if the flow changed) is updated in the same change and the version is bumped.
- [ ] The skill has been run once on a real task before merging.

---
name: flow
description: Draw the flow as a diagram — a story, a change, or the whole repo — to build a shared mental model. Renders inline in the terminal when the diagram mod is on, otherwise in chat.
argument-hint: "(optional) what to diagram — a ticket, 'this change', or 'the architecture'"
---

Turn understanding into a **picture**. When you (or the human) grasp how something hangs together — a
story's flow, what a change touches, a repo's architecture — a diagram makes that shared and durable in a
way a wall of prose doesn't. This is the "let me *see* it" step. **Human-triggered, never forced.**

## When it's used

- **On a story** (usually right after `/align` reflects its understanding) — "what's the flow of this?"
- **On a change** — "draw what this slice touches" (entry point → the pieces it flows through → the result).
- **On the repo** (usually during onboarding) — the architecture / the main request flow, to get oriented.
- **Anytime, later** — nothing stops you running `/flow` on old work to re-derive the picture.

## Process

1. **Pick the subject** from the argument, or ask one short question if it's ambiguous ("the story's flow,
   or the repo architecture?"). Default to what you were just discussing.
2. **Ground it in what's real** — the ticket's criteria, the actual files a change touches, the code you've
   read. Don't draw an idealized diagram that doesn't match the code; a wrong diagram is worse than none.
   For a change, `git diff --name-only` (and the summary from `bin/diff-summary.js`) tells you the real
   surface; for the repo, the entry points and main modules.
3. **Author a mermaid diagram** — pick the shape that fits:
   - **flowchart** — a story's flow, a request path, a decision tree (the usual default).
   - **sequence** — who calls whom over time (an API round-trip, a webhook → handler → store).
   - **classDiagram / erDiagram** — data shapes and relationships.
   Keep it **legible**: a dozen-ish boxes, short labels, group with subgraphs. A giant diagram helps no one —
   if it's huge, draw the one slice that matters, not everything.
4. **Emit it as a ```mermaid fenced block.** Claude Code renders mermaid natively (in chat / artifacts), and
   if the **claude-mermaid** diagram mod is enabled it draws inline in the terminal as coloured boxes — same
   fenced block either way, so you never have to detect which. (Mod off → it still renders, just not inline.)
5. **One line of read-out** — say what the picture shows that the prose didn't (the fork, the loop, the
   layer boundary). The diagram is the artifact; don't re-narrate every box.

## Rules

- **Match the code, not the wish.** Ground every box in something real; flag anything you're inferring.
- **Legible over complete** — draw the slice that clarifies, not an exhaustive map.
- **No PHI/PII in labels** — same rule as any artifact; use role/table names, never patient data (this is a
  `hipaa`-default harness). Run `/phi-redaction-check` if the diagram is going anywhere customer-facing.
- **It's an offer, never a gate** — surfaced as a one-line invitation elsewhere; it never blocks a flow.

## Anti-patterns

- ❌ A 60-box everything-map nobody can read — draw the relevant slice.
- ❌ An idealized architecture that doesn't match the actual code.
- ❌ Forcing a diagram when nobody asked — it's an option, not a step.
- ❌ Real patient data in a node label.

## Completion criteria

- [ ] A legible mermaid diagram of the requested subject, grounded in the real code/criteria.
- [ ] One line naming what it reveals; no PHI in any label.

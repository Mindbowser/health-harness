---
name: import-issues
description: Pull this sprint's stories/bugs from the tracker (Jira/Linear) as context for alignment — reshape, don't re-elicit.
---

Fetch stories/bugs from the issue tracker and bring them in as raw context for `/align` and
`/to-issues`. The point is to **reshape work the BA/PM already wrote**, not re-elicit it. The tracker
is the system of record; this is the PULL half of the round-trip (the PUSH half is `/to-issues`).
Connection setup: `docs/jira.md`.

## Process

1. **Find the tracker tools.** Use the configured tracker MCP (Jira/Linear) — the search/JQL + get-issue
   tools. If no tracker MCP is connected, say so and accept the stories pasted by the user (then continue).
2. **Scope the query.** By default, the **active sprint** (read `.mb-harness/current-sprint`) for the
   relevant project/team — e.g. JQL `sprint = "<id>" AND project = <KEY>`. Narrow by assignee/epic if asked.
3. **Fetch stories AND bugs.** A bug is just a story whose aligned outcome is *a fix + a regression
   test*. Pull each issue's title, description, type, acceptance criteria (if any), labels, and links.
4. **Summarize for alignment.** Present a compact list grouped by epic/feature: key, title, type, and
   the gist. Flag the thin ones (no acceptance criteria) — those need the most alignment.
5. **Hand to `/align`.** Per the per-feature rule, align on one coherent feature/epic at a time (not the
   whole sprint at once). The fetched issues are the input; `/align` sharpens them into a design concept.

## Anti-patterns

- ❌ Treating fetched tickets as final specs. They're input to reshape, often thin/horizontal.
- ❌ Pulling the entire backlog into one context (smart-zone blowout). Scope to the sprint/feature.
- ❌ Re-asking the BA for things the ticket already answers. Read first, then align the gaps.
- ❌ Inventing a tracker connection. If no MCP is present, ask for pasted stories — don't fabricate keys.

## Completion criteria

- [ ] The sprint's stories + bugs are fetched (or pasted) and summarized, grouped by feature/epic.
- [ ] Thin tickets (missing acceptance criteria) are flagged.
- [ ] A single coherent feature is selected to take into `/align` next.

> PUSH-back (writing acceptance criteria + sliced sub-tasks to the tracker) happens in `/to-issues`.

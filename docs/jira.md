# Connecting the tracker (Jira / Linear)

The harness reads stories/bugs *in* and writes enriched acceptance criteria + sliced sub-tasks *back*.
The tracker stays the **system of record**; the harness is the thing that turns a thin story into an
aligned, sliced, acceptance-tested unit of work.

## How the connection works — an MCP server (recommended)

The agent talks to Jira/Linear through an **MCP server**, which gives it tools to search
(JQL), read, create, update, and comment on issues. Configure it once per workspace (`.mcp.json` at the
workspace root, or `claude mcp add`), so the whole team's sessions share it.

- **Jira Cloud →** Atlassian's **official remote MCP server** (OAuth login; no API token in the repo).
  Add it as a remote MCP in your agent and authenticate in the browser.
- **Jira Server/Data Center, or stricter control →** a **community Jira MCP** run locally (Docker/uvx)
  with a scoped **API token** in an env var (never committed).
- **Linear →** Linear's MCP server (the skills are tracker-agnostic — they use whatever issue tools exist).
- **Fallback (CI / no MCP) →** the tracker REST API via a small script with an API token. Slower to
  wire; use only where an MCP can't run.

> Confirm the current endpoint/package when you set up (vendors move these). The harness skills don't
> hard-code a provider — they use the issue tools the configured MCP exposes. If no tracker MCP is
> present, `/import-issues` falls back to you pasting the stories, and `/to-issues` prints the issues
> for manual entry.

Verify it's connected: in a workspace session, the agent should be able to "list issues in the current
sprint" (a JQL/search tool call). If that works, the round-trip below works.

## The round-trip

```
PULL  /import-issues   JQL → fetch this sprint's stories/bugs → into /align context
        ↓
      /align → /to-prd → /to-issues   (the Build Loop; see CONTEXT.md)
        ↓
PUSH  /to-issues writes back to the tracker:
        • detailed ACCEPTANCE CRITERIA (Given/When/Then) onto each parent story
        • a link to the PRD + api-contract (the spec) in the story
        • per-repo SUB-TASKS = the vertical slices, with cross-repo blocking links
        • a label/field marking the sprint + that it went through the harness
```

### Pull (`/import-issues`)

Fetch by JQL — e.g. the active sprint and assignee/team — and **reshape**, don't re-elicit: bring the
stories/bugs in as raw context for `/align`. Bugs come in too (a bug is just a story whose "aligned"
outcome is a fix + a regression test).

### Push (`/to-issues`)

After alignment + slicing, write the result back so the tracker reflects reality:
- **Acceptance criteria** in **Given/When/Then** form — testable, and they become the `/tdd` behavior
  list. This is the "detailed spec" that was missing on the thin original story.
- **Spec links** — the `prd.md` and `api-contract.md` paths/URLs, so anyone on the story can see the design.
- **Vertical-slice sub-tasks**, tagged per repo (FE/BE/infra), with **blocked-by** links across repos
  (BE endpoint → FE wiring; infra → deploy).
- Idempotent: re-running updates the same issues (match by key), never duplicates.

## Closeout — lifecycle transitions + worklog (from `/tdd`)

The tracker should reflect where the work actually is, and carry the time spent:
- **Pre-flight:** before starting, check the ticket's status — if it's already **at/past review** (*In
  Review* / *Ready for QA* / *QA* / *Done* / *Closed* / *Resolved* / *Cancelled*; match the category, not
  the label), **warn and confirm** before working. Catches wrong keys, reopened/finished work.
- **Start:** when build begins, move the ticket to **In Progress** (this also anchors the worklog clock).
- **End:** when the PR is open, move it to **In Review** (= *Ready for QA* — one status in our flow) and
  **comment** the PR link + "acceptance criteria met" + the criteria→test summary.
- **Worklog:** `/tdd` runs `bin/worklog-suggest.js` to propose a time from git activity (an **active**
  estimate, plus the **elapsed** span for reference), then logs the **user-confirmed** value via
  `addWorklogToJiraIssue` (`timeSpent`, `started`, `commentBody`). It's a suggestion only — never
  auto-logged, never argued up or down. Opt out per repo with `project.json` `timeTracking.logWork:false`.

See `/tdd` → *Time tracking* for the heuristic and the `timeTracking` config keys.

## Governance on the way back

Anything written to the tracker is **customer/third-party-visible**. Run `/phi-redaction-check` on the
text you push (acceptance criteria, comments) — no PHI/PII/secrets in a Jira ticket. Reference records
by id, not by patient data.

## Permissions

Use a tracker account/token scoped to the relevant projects with read + write-issues + comment. The
push is create/update issues + comments only — it never deletes. Keep the token in env/OAuth, never in
the repo (the redaction check + `.gitignore` back this up).

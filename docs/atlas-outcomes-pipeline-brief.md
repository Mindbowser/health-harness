# Brief for the Atlas agent — fill Faster / Better / Done-right + account attribution

> **⚠ Updated (MBI-23 shipped, 2026-06-25).** The harness now emits **deterministic, client-side** outcome
> signals that **supersede the git-churn heuristic** described below — prefer them when present:
> - **Faster** → the **`ticket_transition`** telemetry stream (real cycle-time from Jira status changes,
>   with dev-cycle vs QA-wait already segmented) instead of clone-and-diff PR cycle time.
> - **Better** → the **commit symbol fingerprint** (`commit.fp`, post-merge rework of the *same logical
>   unit*) + **reopen** transitions, instead of line-churn.
> - **Test strength** → **`test_strength` (`kind=mutation`)** from `npm run mutation:emit`.
>
> The git/PR approach below stays as a **fallback** for repos/windows with no telemetry. Producer details +
> the "what matters most" framing: `docs/what-the-harness-measures.md`. Consumer dashboard = **MBI-24**.

Paste the block below to the **mbi-atlas** agent. It completes the v2 scorecard: today `faster` and `better`
are `null` placeholders, `doneRight` is `partial: true`, and the account correlation has no adoption data.

---

## PROMPT (copy from here)

Complete the Harness AI Usage scorecard. In `buildHarnessRollup()` (server.js ~line 2389) the `v2` object
currently has `faster: null` and `better: null` (placeholders), `doneRight.partial = true`, and
`correlationPanel` with no adoption attribution. Fill them by adding a **git/PR data step to the existing
background rollup job** — NOT in any request path, and NOT by giving Atlas write access. Use a **read-only
GitHub token** (`GITHUB_TOKEN` in server.env). If the token is absent, leave the field `null`/"—" and keep
serving the rest (graceful degradation).

### Where to compute: the background rollup job only
`refreshHarnessRollup()` already runs on an interval + manual refresh and caches to
`data/harness-usage-rollup.json`. Add the git/PR work there. Cache shallow clones / API results under
`data/` and refresh incrementally; the `/api/harness/usage-report` endpoint keeps serving the cached rollup
instantly. Rate-limit-friendly (batch, cache ETags/last-SHA).

### Faster — cycle time per work item
For each **merged PR** in the window: `cycle = first commit on its branch → merge time`. Report the
**median** (org + per slice). Key each PR to its ticket via the **`issueKey`** in the branch name or PR title
(same `[A-Z][A-Z0-9]+-\d+` pattern the telemetry uses). Exclude bot/dependabot PRs. `faster.medianHours`,
plus `trend` vs prior window.

### Better — churn / rework rate (GET THE DEFINITION RIGHT)
Measure **rework of MERGED code only**: lines that landed on the default branch, then were rewritten or
deleted **within ~14 days**, as a fraction of lines merged in the window. `better.reworkRate = churnedLines /
mergedLines`, per repo, plus `trend`.
- **CRITICAL:** do NOT count in-branch churn (pre-merge). Red-green-refactor churn is *healthy* — counting it
  would punish good TDD, which is exactly what the harness promotes. Window starts at **merge**, not at first
  write.
- Exclude generated/vendored/lockfiles (`dist/`, `build/`, `node_modules/`, `*.lock`, `*.min.*`, snapshots).
- Compute **per-repo** (not per-author — avoid blame). Implementation: shallow clone (or `git log -p`/blame
  over the window) in the background job.
- Treat as a **noisy trend**, never an absolute or a per-person score.

### Done-right — complete it (drop `partial`)
Per **merged PR** in the window, it's "done right" if ALL hold:
1. **Aligned** — its `issueKey` had a `/align` command event in telemetry, AND
2. **Gate-green** — a passing `gate_run` event for that work, AND
3. **Reviewed** — ≥1 PR approval (GitHub), AND
4. **Linked** — an `issueKey` is present (traceable to a ticket).
`doneRight.rate = doneRightPRs / mergedPRs`. (Jira *status* is optional; issueKey-present is enough for
"linked.") Remove `partial: true` once PR data is wired.

### Account attribution — SKIP for now
**Decision (2026-06-21): do not build `repoId`→account attribution, and remove the account/correlation panel
from the dashboard** (both the UI and the `correlationPanel` computation). It can't be attributed yet, so it
was empty clutter. Faster/Better/Done-right above are computed **org-wide + per-repo + per-dev only** — no
account rollup. (Account cohorts can return later if a `repoId`→account map and CSAT data both exist.)

### Config / secrets
- `GITHUB_TOKEN` (read-only; repo + PR read) in `deploy/server.env`.
- Repo set: an org + topic filter, or an explicit repo list in `data/harness-repos.json`. Document it.

### Guardrails (unchanged)
- Background only; request path serves cache; missing token/data → `null`/"—", never a crash.
- Non-punitive; per-repo/account, not per-person ranking. Churn is a trend, not a verdict.
- Leadership-gated (existing `effectiveUser(req).admin` check on `/api/harness/usage-report`).

### Acceptance
- `faster.medianHours`, `better.reworkRate`, `doneRight.rate` (no `partial`) populate when `GITHUB_TOKEN` is
  set; degrade to "—" when not.
- Churn counts **post-merge rework only** (verify: a PR with heavy pre-merge commits but no post-merge edits
  has ~0 churn).
- Account/correlation panel is **removed** (UI + `correlationPanel` computation); no `repoId`→account map.
- All computed in the background rollup; first paint never blocks; cached `<~100ms`.

(Code anchors: `buildHarnessRollup` ~2389, the `v2` object ~2620 with `faster/better` null ~2627-2628,
`correlationPanel` query ~2600, `refreshHarnessRollup` ~2659, report endpoint ~2674.)

## END PROMPT

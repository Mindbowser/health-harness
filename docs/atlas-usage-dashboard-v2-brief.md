# Brief for the Atlas agent — Harness AI Usage v2 (CTO scorecard: outcomes, process, Jira slicing)

Paste the block below to the **mbi-atlas** agent. It evolves the existing "Harness AI Usage" tab from an
*activity* dashboard into a *did-we-get-better* instrument for an IT-services healthcare CTO.

---

## PROMPT (copy from here)

Evolve the **Harness AI Usage** view in MBI Atlas. Today it shows AI *activity* (sessions, /align uses,
push-backs, compactions…). That answers "are people doing the rituals," not the question the CTO actually
has: **"Is the AI harness making us deliver faster, at higher quality, provably PHI-safe, with the process
followed?"** We're an IT-services company in healthcare — productivity = more delivery per paid hour, quality
= less rework + fewer defects, safety = zero PHI leaks, process = the Build Loop actually followed.

### 1. Collapse the top line to FIVE simple numbers (each with a trend arrow vs the prior period)
Demote the current 9 activity cards into a per-dev "coaching" drawer (they explain *why*, not *are we
winning*). The CTO scorecard is exactly these five, and **every one must be filterable** (see §2):

| # | Number | Definition | Data source |
|---|---|---|---|
| **Adopted** | % of engineers active this week **and** on the current harness version | harness telemetry |
| **Faster** | median **cycle time per work item** = first commit (or first `/align`) on a ticket → its PR merged | git/PR + the ticket's Jira key |
| **Better** | **rework rate** = % of changed lines reverted/rewritten within ~14 days (churn) | git history |
| **Safer** | PHI/redaction catches + governance (wall) blocks; **headline target = 0 leaks** | telemetry: `wall` + new `redaction` events |
| **Done-right** | % of shipped work that followed the loop: **aligned → test/gate-green → reviewed → linked to a Jira issue** | telemetry + git/PR + Jira status |

Rules: keep it to these five. Show a **trend arrow** (this period vs last) — "gains" need a direction, not a
snapshot. Do **not** add a "time in tool / session-duration" KPI — seat-time rewards the opposite of the goal
(the harness should make work take *less* time). If you capture session duration at all, label it a
wellbeing signal, never a productivity metric.

### 2. Make the scorecard filterable by Jira work-item dimension
This is the highest-value capability: productivity/quality mean different things for a P1 bug vs an epic. Add
a filter so the five numbers recompute for a selected slice:
- **issue type** (bug / story / task / epic), **priority**, **severity**, **story vs epic**.
The questions it must answer: "Are P1/Critical issues getting tests + review (Done-right on what matters)?",
"Is bug cycle time improving?", "Which epic is leaking rework?". Tag each unit of work with its Jira
classification (see the data contract in §4) and group by it.

### 2b. Per-developer health table (status, not a ranked score)
Keep the per-dev table, but make each row a **best-practice health check**, not raw counts. One row per dev,
columns = the habits that matter, each shown as a simple **status** (🟢 healthy / 🟡 thin / ⚪ no signal),
plus the composite **Done-right %** and a **Focus area** (the single habit to coach next):

| Dev | Active | Done-right | Feedback loop | Align-first | Validation (tests) | Prompt quality | Engagement | Safety | Focus area |
|---|---|---|---|---|---|---|---|---|---|
| dev@… | 🟢 4d, v0.1.78 | 72% | 🟢 | 🟡 | 🟢 | 🟡 | 🟢 | 🟢 | "align before building" |

- Each habit cell is a 🟢/🟡/⚪ derived from that dev's metric vs a healthy threshold (calibrate empirically;
  don't hardcode judgment). Hover/expand → the underlying numbers (this is where the old activity counts live).
- **Do NOT show a single ranked 0–100 "score" or a leaderboard.** A composite score gets gamed and turns
  coaching into ranking (anti-Goodhart; the program is non-punitive by policy). "Done-right %" + per-habit
  status + a Focus area is the healthy framing: it tells a lead *where to help*, not *who's worst*.
- Sortable by any column; default sort by Done-right ascending so "who needs support" surfaces first —
  framed as support, not blame.

### 3. Account-level adoption ↔ delivery outcomes — DEFER, then build it focused (not a full table)
This is eventually the ROI proof (do high-adoption accounts deliver better?), but **build it only when both
sides have data — until then, do not render it** (an all-accounts table with blank CSAT and "tagging
pending" is clutter, not signal). Two prerequisites:
1. **Attribution** — tie harness usage to an account. Use the simplest bridge: **`repoId` → account** (each
   client project is usually its own repo; map repo→account once). Do NOT attempt the harder
   issueKey→Jira-project→account hop.
2. **Outcome data** — CSAT / on-time / open-flags actually populated from mbi.db.

When both exist, render it as a **comparison, not a 20-row dump**:
- Show **only accounts with harness activity**, split into **high-adoption vs low-adoption** cohorts.
- Compare their delivery outcomes: *high-adoption accounts → avg CSAT X, on-time Y%, flags Z; low-adoption → …*
- That 2-cohort insight is the ROI answer; a flat list of every account is not.

Until then, the live dashboard is just the **5 KPIs + the per-dev health table** (§1, §2, §2b) — those have
real data and drive behavior. Keep the account panel out of the UI (or behind a "coming when attributed"
note) rather than showing empty rows.

### 4. Data contract (what comes from where; degrade gracefully if a field is absent → show "—", never crash)
- **From harness telemetry** (`/home/ubuntu/.openclaw/shared/harness-telemetry/<email>/<date>.jsonl`, one
  JSON/line; you already ingest this):
  - existing: `ts, userId, repoId, hv, event` + per-event fields (`gate_run.result`, `command.name`,
    `prompt.hasContext`, `commit.*`, `wall.action`, …).
  - **LIVE NOW (harness v0.1.78):** `command` and `prompt` events carry **`issueKey`** (e.g. "ACME-258") —
    the Jira ticket the work is on; and a new **`redaction`** event carries **`hits`** (PHI/secret catches).
  - **issueType / priority / severity / level are NOT in telemetry** — `issueKey` is the join key; **you
    resolve the classification by looking the key up in Jira** (Atlas reads Jira; the key is the bridge).
    Cache the key→classification map.
- **From git/PR (Atlas computes — you already pull git):** cycle time (commit→merge), rework/churn, PR
  reviewed/merged. **Link commits → Jira issue** via the key in the branch/PR name (or the telemetry
  `issueKey`). This is how Faster/Better/Done-right get computed and sliced.
- **From mbi.db (Atlas):** delivery outcomes for the §3 correlation.

### 5. Performance — load async (unchanged from v1)
Never read the telemetry files or compute joins in the request path. Background aggregator → cached rollup
(in-memory + `data/harness-usage-rollup.json`), refreshed on an interval + manual "Refresh"; track file
mtime/size for incremental re-reads; the page renders its shell and fetches the rollup async (like
`/api/kpis`). The git/Jira joins for cycle-time/rework go in the same background job.

### 6. Conventions & guardrails
- Reuse Atlas's Express `server.js` patterns, the `.env` loader, Slack-OAuth `resolveUser` + leadership-role
  gating, deploy via `deploy/deploy.sh`. Metadata only; identity = git email.
- **Non-punitive:** this is for coaching + finding where to help, never ranking/PIPs. No per-dev leaderboard
  framing on rung-3 numbers.
- **Anti-Goodhart:** these are leading indicators of the outcomes — if a habit metric doesn't move the
  outcome, surface that, don't reward the ritual. The scorecard stays five numbers; resist card sprawl.

### 7. Acceptance
- Top line = 5 numbers (Adopted/Faster/Better/Safer/Done-right) with trend arrows; activity detail moved to
  a per-dev drawer.
- The five recompute correctly when filtered by issue type/priority/severity/epic.
- The per-dev health table renders (status + Done-right + Focus area; no ranked score).
- The account panel is **deferred** — not shown until `repoId`→account attribution + CSAT/outcome data exist;
  when built, it's a high-vs-low-adoption cohort comparison over **active accounts only**, not a full list.
- Rollup served from cache (<~100ms) for 50+ devs; first paint never blocks on file/git I/O; missing fields
  render "—".

(Reference in the harness repo: `docs/usage-coaching-prd.md`, `docs/atlas-telemetry-deploy.md`,
`docs/atlas-usage-dashboard-brief.md` (v1), `bin/usage-coach.js`, `bin/harness-stats.js`.)

## END PROMPT

# Brief for the Atlas agent — "Harness AI Usage" dashboard

Paste the block below to the **mbi-atlas** agent. It explains what the telemetry is, where it's stored, and
how to surface it on the Atlas UI (async, since reading many JSONL files is slow).

---

## PROMPT (copy from here)

You're adding a **"Harness AI Usage"** view to MBI Atlas — a leadership dashboard of how the engineering
org is adopting the Mindbowser Health Harness (our Claude Code plugin). Build it to Atlas's existing
conventions. This is **metadata-only** adoption analytics, **non-punitive** (coaching/where-to-help, never
ranking/PIPs).

### 1. What the data is
Each developer's machine runs the harness, which logs **metadata-only** usage events (no code, prompts,
file contents, or PHI — a write-time allowlist guarantees this) and uploads them to Atlas. Events capture
the "10x AI dev" habits we coach toward: tight feedback loops, align-before-code, small steps, prompt
quality, critical engagement (objecting to AI output), smart-zone, governance.

### 2. Where it's stored (already live)
- Ingest endpoint **already built**: `POST /api/harness/usage` (Bearer-token auth, bypasses the Slack
  session gate; token = `HARNESS_TELEMETRY_TOKEN` in the server env). It appends records to:
- **`/home/ubuntu/.openclaw/shared/harness-telemetry/<git-email>/<YYYY-MM-DD>.jsonl`**
  — one folder per developer (their git company email), one file per day, one JSON object per line.
- Record shape (fields vary by `event`):
  ```json
  {"v":1,"ts":"2026-06-21T16:03:01Z","userId":"dev@mindbowser.com","repoId":"some-repo",
   "hv":"0.1.68","event":"commit","sizeBucket":"s","branchKind":"feature","_rxAt":"2026-06-21T16:12:14Z"}
  ```
  Common keys: `ts` (event time, ISO), `userId` (git email = identity), `repoId` (repo name),
  `hv` (harness version), `_rxAt` (server receive time), `event` (type below).
- **Event types and their fields:**
  | event | fields | signals |
  |---|---|---|
  | `session_start` | — | sessions / active devs |
  | `tool` | `tool`, `ok` | activity |
  | `edit` | `ext` | edits |
  | `gate_run` | `result` (`pass`/`fail`) | feedback loop |
  | `command` | `name` (e.g. `align`, `tdd`, `start`) | skill adoption |
  | `prompt` | `lenBucket` (s/m/l), `hasContext` (bool) | prompt quality |
  | `commit` | `sizeBucket`, `branchKind` | small steps |
  | `revert`/`user_reject`/`interrupt`/`correction` | — | critical engagement ("push-backs") |
  | `compaction` | — | smart zone |
  | `wall` | `action` (`deny`/`ask`), `why` | governance |
  | `subagent` | — | delegation |

### 3. Metrics to compute (mirror the harness's own definitions — don't invent new ones)
Aggregate per **developer**, per **day**, and **org-wide**:
- **Adoption:** active devs (distinct `userId` with a `session_start`), total sessions, breakdown by `hv`
  (harness version) and `repoId`.
- **Feedback loop:** `gate_run` count, pass-rate = `pass / total`; edits-per-gate-run.
- **Align before code:** count of `command.name == "align"`; `/align`-before-`/tdd` adoption.
- **Small steps:** `commit` count (and `sizeBucket` distribution).
- **Prompt quality:** `% of prompt events with hasContext == true`.
- **Critical engagement:** count of `revert`+`user_reject`+`interrupt`+`correction` ("push-backs").
- **Smart zone:** `compaction` count.
- **Governance:** `wall` events with `action == "deny"`.
The canonical aggregation logic is `summarize()` in the harness repo (`bin/usage-coach.js`) and the render
reference is `bin/harness-stats.js` — mirror those so Atlas numbers match the devs' own `/harness-stats`.

### 4. What to build
1. **A read API:** `GET /api/harness/usage-report?days=30` (gated by the **existing Slack-OAuth**, leadership
   roles: `exec`/`sales_head`/`account_manager` — reuse `resolveUser`/the role check). Returns a JSON
   rollup: `{ org: {...metrics, byVersion, byDay}, devs: [{ userId, ...metrics }], generatedAt }`.
2. **A UI tab** in the Atlas frontend ("Harness AI Usage"): org summary cards (active devs, sessions,
   gate pass-rate, /align adoption, prompt-context %, commits, push-backs), a trend line over `days`, a
   per-dev table (sortable), and a version-adoption breakdown. Match the existing Atlas look (vanilla JS in
   `public/app.js`, the card/table styling already there). **Non-punitive framing** — surface "where to
   help", not a leaderboard.

### 5. Performance — load ASYNC, don't block on file reads
Reading every `harness-telemetry/*/*.jsonl` on each request is slow and will grow. Do NOT aggregate
synchronously in the request:
- **Background aggregator:** a function that scans the telemetry dir, computes the rollup, and **caches** it
  (in-memory + a `data/harness-usage-rollup.json` on disk). Refresh on an interval (e.g. every 10–15 min)
  and/or via a manual "Refresh" button (mirror Atlas's existing `/api/refresh` snapshot pattern).
- **Incremental:** track each file's `mtime`/size and only re-read changed files; keep per-day partial
  aggregates so a refresh is cheap.
- **Serve cached:** `/api/harness/usage-report` returns the cached rollup instantly; the UI renders the page
  shell immediately and fetches the rollup async with a spinner (like `/api/kpis` today). Never read files in
  the request path.

### 6. Conventions, auth, deploy (match Atlas)
- Express app in `server.js`; routes on router `R`; reuse the `.env` loader, `resolveUser`, role gating, and
  the `fs.mkdirSync(recursive)` / safe-path patterns already there.
- Metadata only — never display or store anything beyond the counts above. Identity is the git email.
- Deploy via `deploy/deploy.sh` (rsync → `server.env`→`.env` → systemd restart). No new npm deps if avoidable.

### 7. Acceptance
- `/api/harness/usage-report?days=30` returns within ~100ms from cache for 50+ devs.
- The tab shows org adoption + per-dev table + version breakdown, leadership-gated.
- Numbers reconcile with a dev's local `/harness-stats` for the same window.
- A "Refresh" recomputes the rollup; first paint never blocks on file I/O.

(Reference material in the harness repo: `docs/usage-coaching-prd.md`, `docs/atlas-telemetry-deploy.md`,
`bin/usage-coach.js` `summarize()`, `bin/harness-stats.js`.)

## END PROMPT

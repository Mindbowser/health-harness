# Testing onboarding (and the usage/coach features)

Repeatable checks for the first-run experience. Paths assume you're running from the harness repo
(`mb-harness/`); in any repo with the plugin installed you can use the slash commands instead.

## 1. Pre-flight — the deterministic part (fastest signal)

Run it in a **real, set-up repo** (you have git + Jira connected):
```bash
node bin/preflight.js
```
Expect: **Git identity ✅** (your @mindbowser.com email), **Git remote ✅**, **Feedback-loop gate ✅** (if a
real `npm test` exists), **Branch** ⚠️ if you're on `main`. Two will likely show ⚠️ even though you're "set up":

- **Compliance profile ⚠️** until you've run `/start` (`/compliance-profile`) in that repo.
- **Tracker ⚠️** — this checks for **recorded coords** in `.health-harness/project.json`, *not* the live Jira
  MCP. "Jira MCP connected" and "coords recorded" are different: the MCP connection is verified by the agent
  in `/start` step 4 (it lists issues); `/start` then writes the coords so this check goes green next time.

## 2. See every failure mode — scratch repo (no risk to a real repo)

```bash
H=/Users/pravinuttarwar/Data/MBI/mb-harness          # harness repo
T=$(mktemp -d); cd "$T"; git init -q

node "$H/bin/preflight.js"                            # gate ❌; email shows your GLOBAL git email (see note)
git config user.email you@gmail.com                  # a personal address …
node "$H/bin/preflight.js"                            # … → Git identity ⚠️ "looks personal"
git config user.email you@mindbowser.com
git remote add origin https://example.com/x.git
git checkout -q -b feature/test
printf '{"scripts":{"test":"echo \\"Error: no test specified\\" && exit 1"}}' > package.json
node "$H/bin/preflight.js"                            # stub test script → gate ❌ "default stub"
printf '{"scripts":{"test":"node --test"}}' > package.json
node "$H/bin/preflight.js"                            # → all green except compliance/tracker (expected pre-/start)
cd "$H"; rm -rf "$T"
```

> **Note on the email check:** `git config user.email` falls back to your **global** config, so a scratch
> repo inherits it (shows ✅). To see the true "unset" ❌ case, run with an isolated HOME:
> `HOME=$(mktemp -d) node "$H/bin/preflight.js"`.

## 3. Full agent flow — `/start` end-to-end

In a scratch repo (or a real one not yet onboarded), open Claude Code and type:
```
/start
```
Walk it: it runs the pre-flight (step 0), detects archetype (empty → new, has code → existing) and asks you
to confirm, sets the compliance profile, **verifies the Jira MCP by actually listing issues** and records the
coords, confirms your git email, then routes to `/scaffold-from-boilerplate` or `/onboard-existing-codebase`.
Success = pre-flight blockers cleared, `.health-harness/compliance.json` + `project.json` written, and you
land at the front door.

## 4. The personal dashboard + coach

```
/harness-stats           # 7-day dashboard
/harness-stats 30        # 30-day window
```
Your real log is currently thin, so to preview the **motivational** coach with realistic numbers:
```bash
node -e '
const {buildCoaching}=require("./bin/usage-coach.js");
const cur ={edits:6,gateRuns:5,gatePass:5,commands:{align:2,tdd:1},objections:2,commits:3,prompts:6,promptsCtx:5,compactions:0,wallDeny:0};
const prev={edits:12,gateRuns:4,gatePass:2,commands:{align:0},objections:0,commits:0,prompts:6,promptsCtx:1,compactions:0,wallDeny:0};
console.log(buildCoaching(cur,"weekly",prev));'
```
To re-trigger the **real** once-a-day coach (it fires at SessionStart and marks itself done for the day):
```bash
rm -f ~/.health-harness/usage/.coach-state.json   # then start a new Claude Code session
```

## 5. Telemetry upload (only after Atlas is deployed — see atlas-telemetry-deploy.md)

```bash
HARNESS_TELEMETRY_ENDPOINT=https://mbi.mindbowser.com/atlas/api/harness/usage \
HARNESS_TELEMETRY_TOKEN=<token> node bin/usage-upload.js
```
With no endpoint set it is a silent no-op (default OFF). After a run, confirm the per-user file on the server
(see the deploy doc's Verify section).

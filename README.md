# Mindbowser Health Harness

> Mindbowser's discipline for building **healthcare products with AI agents** — a repeatable build loop
> plus healthcare-compliance guardrails, installed in every project, improved by everyone.
> **The discipline is agent-agnostic;** this repo packages it as Claude Code skills.

**What's a harness?** A safety rig — the gear that lets you move fast on dangerous terrain without
falling. That's the whole idea here.

**Why it matters in the AI era.** AI agents changed *how fast* code gets written — but not what makes
software *good*. The fundamentals haven't moved in 20+ years: tight **feedback loops**, **tests you
trust**, **small reversible steps**, **clear interfaces / deep modules**, and **human review where taste
lives**. Generating code faster doesn't suspend any of that — it *raises the stakes*, because an agent
produces broken work as fast as good work. The Mindbowser Health Harness doesn't invent a new process; it
**re-applies those timeless engineering fundamentals as a repeatable discipline**, so a team can move
*fast* with agents and *not fall*.

For Mindbowser, the terrain is **healthcare** — PHI, HIPAA, client IP, regulated data — so on top of the
build loop the harness adds the guardrails that make speed *safe*: compliance profiles, a redaction
check, audit + PHI-safe logging, and a deterministic "wall."

**It works with any AI coding agent** — the Build Loop, the gate, the slices, and the guardrails aren't
tied to one tool. Only the *packaging* is: this repo is a [Claude Code](https://claude.com/claude-code)
**plugin**, so the install steps, skills, and the wall hook are Claude Code mechanics. Install once, and
everyone on the repo gets the same skills (`/align`, `/tdd`, …) and the same standards.

## The Build Loop (the method)

| Phase | SDLC | Who | What |
|---|---|---|---|
| **1. Align** (e.g. `/align ACME-258`) | Requirements→Design | PM/BA + Dev | Relentless interview → a shared design concept + **acceptance criteria**. Two personas: **AUTHOR** (PM/BA, at refinement — business criteria) and **BUILD-PREP** (Dev, at pick-up — technical criteria + feasibility). Detects the item level (epic/story/bug) and **orchestrates phases 2–3 as sub-steps.** |
| **2. PRD** (`/to-prd`) | Design | *(orchestrated by `/align`)* | **Epics / large features only:** consolidate the alignment into a disposable `prd.md` to slice from (local, gitignored — Jira keeps the record). |
| **3. Slice** (`/to-issues`) | Design | *(orchestrated by `/align`)* | Break into **vertical slices** (schema→API→UI→tests) → Jira sub-tasks with blocking (e.g. `ACME-259`, `ACME-260`). |
| **4. Build (AFK)** (`/tdd`) | Implementation+Testing | Engineer + AI | Build the grabbed slice (e.g. sub-task `ACME-259`): pre-flight (warn if already in QA/Done) → *In Progress*; TDD red-green-refactor; gate green; governance; PR + worklog → *In Review*. |
| **5. QA** | Testing | QA + PM | Verify the acceptance criteria in the running app. Where human taste is imposed. |

**Operationally you touch just two verbs** — `/align <item>` (refine: criteria + slices pushed to Jira,
e.g. `/align ACME-258`) and `/tdd` (build the grabbed slice, e.g. sub-task `ACME-259`). PRD and slicing
are sub-steps `/align` runs, so nobody memorizes which command fits.
**The middle of the loop is invariant; the *front door* varies** — a new repo from MB boilerplate or an
existing codebase — and `/start` picks it for you. See `CONTEXT.md` and `COMMANDS.md`.

## How it flows (Agile ceremony → SDLC phase)

The harness **slots into the Scrum cadence you already run** — it doesn't replace it. A human picks the
*item*; **`/align` runs in two personas** — a PM/BA refines it (AUTHOR), a dev grounds it in code at
pick-up (BUILD-PREP) — and it pushes vertical slices to **Jira, the kept spec**. Devs grab the top
**unblocked** slice and build it with `/tdd`, which drives the ticket's lifecycle and logs time.
Governance and the wall run automatically throughout. (A consolidation `prd.md` is written only for
**epics / multi-slice features** — local, disposable scaffolding for slicing; the durable record is Jira.)

```mermaid
flowchart TD
    SETUP["🔧 ONBOARDING · Inception — once per repo<br/>/start → pre-flight (git/remote/gate/tracker) · scaffold | onboard · /compliance-profile · establish the gate"]

    subgraph PLAN["📋 SPRINT PLANNING · Requirements"]
        direction TB
        SP["/sprint set · /import-issues<br/>pull this sprint's stories + bugs from Jira"] --> PICK{"Human picks ONE item<br/>e.g. story ACME-258"}
    end

    subgraph REFINE["🎯 REFINEMENT · Design — PM/BA runs /align (AUTHOR)"]
        direction TB
        AL["/align ACME-258<br/>→ acceptance criteria (+ audit/safe-log for PHI)"]
        AL --> BIG{"epic /<br/>multi-slice?"}
        BIG -->|yes| PRD["prd.md — consolidation scaffolding<br/>local · disposable · → child stories"]
        BIG -->|no| SL["/to-issues → sub-tasks ACME-259, ACME-260 …<br/>vertical slices + Given/When/Then"]
        PRD --> SL
    end

    JIRA[("🗂️ Jira · To Do — THE KEPT SPEC<br/>story ACME-258 + sub-tasks ACME-259/260 (blocking DAG)")]

    subgraph BUILD["🔨 SPRINT EXECUTION · Implementation + Testing — Dev + AI (AFK)"]
        direction TB
        GRAB["grab top UNBLOCKED slice<br/>e.g. sub-task ACME-259"] --> BP["/align ACME-259 (BUILD-PREP) · Dev<br/>ground in live code → technical criteria + feasibility"]
        BP --> WIP["Jira → In Progress<br/>⚠ pre-flight: warn if already in QA/Done"]
        WIP --> TDD["/tdd · build sub-task ACME-259<br/>red → green → refactor · gate green<br/>governance: safe-logging · audit · redaction"]
        TDD --> PRW["/ship · push → PR → Jira In Review → worklog<br/>(each step confirmed)"]
    end

    subgraph VERIFY["✅ CODE REVIEW + QA · Quality gate → Testing"]
        direction TB
        CR["peer review + CI green + /phi-redaction-check → merge"]
        CR --> QA["QA verifies acceptance criteria in the running app"]
    end

    REL["🚀 RELEASE · Deployment<br/>gate green across repos · redaction + audit check · deploy → Jira Done"]

    SETUP -.->|first time only| SP
    PICK -->|sizable / ambiguous| AL
    PICK -->|small / clear| JIRA
    SL --> JIRA
    JIRA --> GRAB
    PRW --> CR
    QA --> REL
    REL -.->|next item| PICK
```

> **Reading it (left = Agile ceremony, right = SDLC phase):** onboard once → at planning pull the sprint
> and pick one item → a PM/BA `/align`s it (AUTHOR) into Jira criteria + slices → a dev `/align`s it again
> at pick-up (BUILD-PREP) for technical criteria + feasibility → builds unblocked slices with `/tdd`
> (ticket walks **To Do → In Progress → In Review**, worklog logged) → review + QA verify the criteria →
> release (→ **Done**). Small/clear items skip refinement and go straight to the board.
>
> **What to use, and where it lives:** you touch two verbs — **`/align`** (refine) and **`/tdd`** (build).
> `/to-prd` + `/to-issues` are sub-steps `/align` runs. **`align.md` / `prd.md` are local, disposable,
> gitignored** working notes under `.health-harness/sprints/` (a `prd.md` is written only for epics/large
> features) — **not** the source of truth. **Jira is the kept spec** the whole org reads: acceptance
> criteria on the story + the sliced sub-tasks. Rule of thumb: **refine in `/align`, read the truth in Jira.**
>
> **The wall runs across every lane:** push, PR, Jira writes, and a commit on the base branch all stop
> for your approval; catastrophic actions are blocked outright.

**Who runs which command, when?** The day-one reference — every command mapped to its Agile ceremony +
SDLC phase, who drives it, and what it produces — is in **`COMMANDS.md`**.

For the **full mental model** — the three planes (Intent → Design → Build), every role's lens (PM,
architect, engineer, QA, head of delivery, platform), clean architecture in the code *and* the process,
and how it scales to many teams/clients — see **`docs/delivery-mental-model.md`**.

## Non-negotiable principles

1. **Feedback loops are the quality ceiling.** No one-command gate → no good agent output.
2. **Vertical slices, never horizontal.** Demoable at every step.
3. **TDD is mandatory for AFK work.** It stops agents faking tests.
4. **Stay in the smart zone.** Small tasks; clear-and-loop over compacting; tiny system prompts.
5. **Own your planning stack.** Observability over the whole flow, not a black box.
6. **Deep modules.** Design interfaces, delegate implementations.
7. **Human QA is where taste lives.** Don't automate the idea, the QA, and the research all away.
8. **The harness is the healthcare differentiator.** Compliance, redaction, **audit-logging, and
   PHI-safe logging** aren't overhead — they're what let us ship fast *and* safely. For PHI work they're
   **authored as acceptance criteria at `/align` and verified in `/tdd`**. See `skills/compliance-profile`,
   `skills/phi-redaction-check`, `skills/safe-logging`, `skills/audit-logging`.

## The wall — enforced guardrails (not just instructions)

Installing the plugin installs a **PreToolUse hook** (`hooks/outward-guard.js`) that *deterministically*
gates tool calls — it's a wall, not a guideline the model might skip:

- **DENY** (hard block): force-push, `rm -rf /`/`~`, dropping/truncating tables, fork bombs, `mkfs`/`dd`
  to a device. The agent simply cannot run these.
- **ASK** (you must approve): `git push`, `gh pr create`/merge, `rm -rf`, `git reset --hard`, package
  publish, `docker push`, cloud/infra mutations (`kubectl/terraform/aws … apply|delete|deploy`), `curl`
  writes, **a `git commit` while you're on the base branch** (`main`/`master`/the configured `baseBranch`
  — branch first, or approve to commit on base), and **external-system *content* writes via MCP** (Jira/Linear
  create/update). **Reversible, low-stakes MCP ops — a status `transition`, a `comment`, a `worklog` — DEFER
  (no prompt)** since they're routine and reversible (MBI-67); the redaction egress scan still runs on them,
  so PHI in a comment is still DENY'd.
  - **`git push` / `gh pr create` redirect to `/ship`** (MBI-69): outside an active `/ship` grant, the ASK
    reason says *"this is a shipping step — run `/ship`"* (it batches push → PR → Jira → worklog + redaction
    + breaking-change). You can still approve a one-off manual push, but the default path is the flow; inside
    `/ship` the grant suppresses these (one approval for the whole batch).
- **DENY → agent self-corrects** (no human): a **malformed commit message**. The wall enforces a
  deterministic conventional `type(scope): subject` prefix (on by default); a bad message is blocked with the
  reason so the agent fixes and retries — you're never asked. Policy is `.health-harness/project.json`
  `commit` (`conventional`, `requireTicket`, `types`). On a customer repo, onboarding **respects a deliberate
  convention** (sets `commit.conventional:false` if they consistently use a different style) but **elevates the
  absence of one** — inconsistent/low-quality history keeps the gate on and is flagged as an improvement, not
  mirrored.
- **ASK → a commit with no linked Jira ticket** (overridable per commit): `commit.requireTicket` is **ON by
  default** — a commit whose ticket isn't resolvable from the **branch or the message** ASKs ("commit
  anyway?") rather than DENYing (the agent can't invent a ticket). Approving proceeds for that commit; set
  `commit.requireTicket:false` to opt a repo out. A soft, passive one-line **nudge also fires on the first
  code edit** of a session with no linked ticket (once/session, non-blocking) so work lands on-board before
  the commit. "Off-board work" needs no new telemetry — it's the **absence of `issueKey`** on the existing
  commit/gate events. (`bin/ticketless-nudge.js`.)
- **ASK → ship-without-a-passing-gate** (anti-hallucination): on `git push`, if the repo has a gate but there's
  **no captured PASSING gate run for this commit's sha**, the wall ASKs — a claimed-but-unproven "it's green"
  has no fingerprint, so you run the gate green or *consciously* approve an UNVERIFIED ship. No gate at all →
  ASK + flagged unverified (never a silent skip). NOT suppressed by the ship grant. (`bin/gate-evidence.js`.)
- **DENY → redaction egress gate** (no human): the **outbound content** of a text egress (a `gh pr`/`issue`
  body, a Jira/Linear MCP write) is scanned with the deterministic profile-driven scanner *before* it leaves.
  A **PHI/PII/secret literal** → hard-blocked with the offending **classes** (never the value) so the agent
  swaps in synthetic data and retries; a confirmed false positive is allow-listed once in `compliance.json`.
  Scanner error → fail-**closed** to ASK (never silently allows, never bricks shipping). This is a *backstop*
  for literal PHI — it does **not** catch code that *logs* PHI at runtime (that's safe-logging, enforced as
  project TDD tests). So redaction is now *enforced at egress*, not just a remembered `/ship` step.
- **DENY → criterion-coverage gate** (agent self-corrects): on `git push`, every authored acceptance
  criterion in the ticket's committed manifest (`.health-harness/criteria/<KEY>.json`, written by `/align`)
  must be pinned by a real test that names its `[AC-N]` id. An uncovered criterion is hard-blocked citing the
  id — the `/tdd` agent writes the test, no human prompt. A criterion marked `[AC-N defer:<reason>]`
  downgrades to ASK. No manifest → dormant (opt-in). NOT suppressed by the ship grant.
  (`bin/criteria-coverage.js`.)
- **ASK/DENY → compliance detectors** (backstop): the diff's *added* lines are scanned for a PHI access path
  (→ audit criterion), introduced logging (→ centralised + rotating app-logging criterion), or a date/time
  API with no `tz-safe` marker (→ timezone, DENY). The date/time detector is **language-agnostic** — it
  fires on JS, Python, Ruby, .NET, PHP, Go and JVM date APIs (not JS-only), so it can't silently no-op on a
  non-JS product repo. When the matching convention is recorded in
  `.health-harness/conventions.json` (logger module / audit helper, set once at `/start`·onboard·scaffold)
  the backstop is a deterministic **DENY**; absent a recorded convention it's a heuristic **ASK**.
  (`bin/criteria-detect.js`, `bin/conventions.js`.)
- **DEFER** (untouched): reads, local/reversible work (a well-formed `git commit` on a feature branch,
  branch, tests, the scanner).

So every **outward** action — anything that leaves your machine or mutates a shared system — stops for
your approval, the catastrophic ones are blocked outright, commit messages are format-gated, and PHI/secret
literals are blocked at egress — all deterministically. Tested in `test/outward-guard.test.js`.

**One approval per publish, not one per step.** `/ship` shows a single **verbatim outbound preview** (PR
title+body, status from→to, the exact comment, the worklog + how it was derived); on your approval it sets a
short-TTL **grant** (`bin/ship-grant.js`) that makes the wall **stand down on the batch's outward ASKs** — so
you're not re-asked on push, then PR, then each Jira write. The grant only suppresses the *ASK* layer: a
catastrophic command or a PHI/secret in any payload is **still DENY'd**, grant or not.

## Judgment points — the agent governs, it doesn't gatekeep

The harness moves humans from *gatekeeping every step* to *governing at the moments that need a human's
values*. The agent decides the mechanical, reversible, inferable things itself and stops you **only** at a
**judgment point** — and only when the call is **irreversible** *and* **not inferable** (from the
alignment, PRD, or compliance profile) *and* **load-bearing now**. Fail any one of those and it just
proceeds (logging reversible low-stakes choices, batching deferrable ones into a single defaults digest at
QA). Foreseeable judgment calls are **front-loaded into `/align`**, where you're already deciding, so AFK
build stays quiet.

When the agent does stop, it's unmistakable: the reserved opener **`Your call —`**, the **axis** of the
decision (**Taste · Risk · Scope · Compliance** — shown as the header chip in an `AskUserQuestion` popup,
one per question), the cost of each side, and a recommendation. That opener appears **nowhere else** —
permission prompts stay terse and defaulted — so its scarcity is the signal to *stop and govern*. Full
contract in `CONTEXT.md` ("Judgment points").

Every decision and outward action that *does* survive is a **clean click, not a "type yes"**: the
*structured-decision convention* (`CONTEXT.md`) makes confirmations — an outward Jira write, the `/tdd`
hand-off, the `/ship` publish — an `AskUserQuestion` with the **approve option first** (one keypress),
plus **Edit** (via *Other*) and **Skip**, while the rich preview stays readable text above the popup. The
rule cuts both ways: obvious/inferable/reversible steps just happen with a one-line note, so the change
never *adds* prompts — it removes the noisy ones and makes the rest a click.

## Sound cues (optional)

**Spoken voice** cues for lifecycle events — **Claude waiting** ("Your turn.", People), the **safety gate**
("Approval needed.", Integrity), **task done** ("Done.", Excellence), **sub-agent done** (Customer).
**ON by default** (voice); **disable per-person with `export MB_HARNESS_SOUNDS=off`** (or `=chime` for
tones). Plays **bundled spoken-voice clips** (`sounds/voice/`) via the OS audio player — real voice on
**every OS incl. Ubuntu, no TTS install**. Soft, never clinical-alarm-like. Swap in MB-recorded clips to
own the brand voice; details in `sounds/README.md`.

## Install once, globally (recommended)

Install at **user scope** so the harness is active in **every repo you open** — install once, never set it
up per-project again. Run these from anywhere (requires the `claude` CLI; `--scope user` is the default):

```bash
# 1. Register the harness marketplace (globally, for your user)
claude plugin marketplace add Mindbowser/health-harness

# 2. Install the plugin (globally)
claude plugin install health-harness@mindbowser
```

This writes your **user** settings (`~/.claude/settings.json`) — the marketplace source + the enabled
plugin. Installing brings **both the skills and the wall hook** (`hooks/outward-guard.js`, a `PreToolUse`
guard). They load at session start, so **restart Claude Code**, then verify:

```bash
claude plugin list                                 # → health-harness@mindbowser · Scope: user · enabled
claude plugin details health-harness@mindbowser    # → Skills (19) + a PreToolUse hook (the wall)
```

Open any repo and type **`/start`** — it detects new vs existing repo, runs the pre-flight, sets the
compliance profile (default `hipaa`), and routes you to the right front door. Or invoke skills directly:
`/align`, `/to-prd`, `/to-issues`, `/tdd`. Works on any stack; it won't rewrite your code.

**New to the harness?** Type **`/harness-help`** for a one-screen guide — it ships *in the plugin*, so it
works even if you don't have access to this repo.

**Updates are hands-off.** The marketplace is registered with **auto-update**, so the plugin self-updates
on startup; a SessionStart nudge tells you when a new version landed, and `/harness-update` bumps it on
demand. (Manual fallback: `claude plugin marketplace update mindbowser` then reinstall — `uninstall` +
`install` — which is more reliable than `claude plugin update`.)

### Other scopes (when you don't want it everywhere)
- **Pin it to a team repo** so everyone who clones gets it: add `--scope project` to both commands; this
  writes a committable `.claude/settings.json`. Use this for a shared repo where the harness is mandatory.
- **Personal trial in one repo:** `--scope local` writes the gitignored `.claude/settings.local.json`.

### Reinstall cleanly / move from project- to global-scope
If it's currently installed per-project and you want the global model:
```bash
claude plugin uninstall health-harness@mindbowser     # remove the existing install
claude plugin marketplace remove mindbowser           # drop the marketplace
# (optional) delete the plugin lines from that repo's .claude/settings.json so global is the only source
claude plugin marketplace add Mindbowser/health-harness   # re-add globally (user scope)
claude plugin install health-harness@mindbowser           # re-install globally
# then RESTART Claude Code and verify with `claude plugin list` (Scope: user)
```

> **Rolling this out to a team / the whole org, and keeping everyone current?** See **`docs/rollout.md`** —
> the GitHub-marketplace requirement for auto-update, per-repo vs MDM managed-settings install, and the
> exact config (with `docs/managed-settings.example.json`).

> Adding it to an existing/old repo specifically? The step-by-step one-pager is
> **`docs/add-to-existing-repo.md`**.

## Structure

```
.claude-plugin/              # plugin.json + marketplace.json (CLI discovery)
CLAUDE.md                    # org-wide agent instructions
CONTEXT.md                   # shared vocabulary — single source of truth for terms
docs/                        # guides: jira, rollout (+ managed-settings), authoring, multi-repo, mental-model
bin/redaction-scan.js        # the deterministic redaction scanner (+ test/)
bin/worklog-suggest.js       # suggests a Jira worklog time from git activity (+ test/)
bin/play-sound.js            # optional spoken-voice cues, on by default (+ test/)
bin/gen-sounds.js            # generates the cross-platform fallback chime .wav files
bin/session-context.js       # SessionStart hook — injects status + runs the daily coach (+ test/)
bin/usage-log.js             # metadata-only usage events → ~/.health-harness/usage/; `emit` CLI for hygiene signals (+ test/)
bin/issue-switch-nudge.js    # smart-zone reminder: UNRELATED new ticket in a heavy session → suggest a clean one (+ test/)
bin/concerns.js              # extensible cross-cutting-concern registry (timezone/audit/errors/scale/…) surfaced at /align + /tdd (+ test/)
bin/ticketless-nudge.js      # soft once/session reminder when work starts with no linked Jira ticket (+ test/)
bin/issue-graph.js           # deterministic Jira relatedness (parent/epic/links) so related work keeps context (+ test/)
bin/usage-coach.js           # once-a-day (+ Monday weekly) principle-based coaching (+ test/)
bin/usage-upload.js          # ships the usage log to MBI Atlas — inline, time-boxed, chunked (+ test/)
bin/harness-stats.js         # /usage-style personal dashboard behind the /harness-stats skill (+ test/)
bin/preflight.js             # onboarding pre-flight (git/remote-reachable/gh-cli/gate/tracker/role/db-migration-layer) for /start (+ test/)
bin/jira-transitions.js      # infer + persist the Jira workflow transition map so /ship transitions by id, never guesses (+ test/)
bin/ship-grant.js            # short-TTL "user approved this publish batch" marker so the wall doesn't re-ask each step (+ test/)
bin/gate-evidence.js         # records real gate pass/fail per commit sha; wall blocks a hallucinated "it's green" at push (+ test/)
bin/slice-tests.js           # deterministic "did this slice add tests?" (behavioral source vs config/.d.ts) +
                             #   per-ticket test/gate telemetry; `--explain` shows the per-file TEST/SOURCE/IGNORED
                             #   buckets to resolve a disputed flag; project.json `tests.pattern` registers a
                             #   non-standard test layout so it isn't false-flagged (+ test/)
bin/criteria-coverage.js     # deterministic "is every authored [AC-N] criterion pinned by a test?"; wall DENYs an
                             #   uncovered criterion at push; `write` records the manifest, `--explain` drills down (+ test/)
bin/criteria-detect.js       # diff detectors (PHI / introduced-logging / language-agnostic date-time + tz-marker)
                             #   backstopping the audit/app-logging/timezone criteria at the wall; tzGateAction
                             #   drives the TDD skill's build-time timezone question (ask/satisfied/none) (+ test/)
bin/tz-gate.js               # composes the recommended HOSTILE-clock gate run for date-touching slices —
                             #   `--invocation` prints `TZ=<hostile> <gate>` (zone differs from home + has DST) (+ test/)
bin/conventions.js           # records logging/audit/datetime + lint/typecheck/coverage conventions once at
                             #   start/onboard/scaffold; detectors read it to upgrade ASK→DENY (+ test/)
bin/version-gate.js          # WARN-ONLY nudge for a stale install (never blocks): SessionStart resolves
                             #   installed-vs-latest (Atlas /latest) + emits a scope-aware warning (restart for
                             #   managed installs, `plugin update`/`/harness-update` for manual). No PreToolUse
                             #   block — staleness can't be fixed mid-session, so a block would only lock you
                             #   out. FAIL-OPEN: any uncertainty emits nothing (+ test/)
bin/release.js               # `npm run release` — gate + push main + tag health-harness--v<version>
bin/mutation-emit.js         # `npm run mutation:emit` — parse a mutation score from any tool's report/output
                             #   (file arg or stdin) → records test_strength (kind=mutation); pluggable, no
                             #   bundled mutation dep, runnable locally or by CI (+ test/)
bin/boilerplate-registry.js  # resolve a tech stack → MB boilerplate repo (central registry) for /scaffold (+ test/)
sounds/                      # generated chimes; sounds/voice/ = bundled spoken-voice clips (opt-in)
hooks/                       # outward-guard.js (the wall) · sound cues · SessionStart · usage log (PostToolUse, PostToolUseFailure, UserPromptSubmit, PreCompact, SubagentStop)
skills/                      # one folder per skill (FLAT — Claude Code discovers skills/<name>/SKILL.md)
  start/                       # router: detect new vs existing → route to a front door
  scaffold-from-boilerplate/   # front door — new repo
  onboard-existing-codebase/   # front door — existing repo
  sprint/ import-issues/       # sprint container + pull tracker items
  align/ to-prd/ to-issues/ tdd/ ship/    # the Build Loop (ship = publish: push→PR→Jira→worklog)
  compliance-profile/ phi-redaction-check/ safe-logging/ audit-logging/   # healthcare governance
  role/                        # your persona (PM / engineer) — picks the /align mode
  writing-great-skills/        # the meta-skill: how to write skills here
  harness-help/                # in-plugin guide (/harness-help) — usable without repo access
  harness-update/              # one-step plugin update (/harness-update)
  harness-stats/               # your own usage dashboard (/harness-stats) — private, read-only
```

> **Skills are flat by design.** Claude Code discovers plugin skills at `skills/<name>/SKILL.md` (one
> level) — category subfolders are NOT scanned. We keep the grouping as labels above, not directories.

## Usage telemetry (metadata-only)

The harness logs **metadata-only** usage (event counts, no code/prompts/file-contents/PHI — enforced by a
write-time field allowlist) to `~/.health-harness/usage/` to power the daily coach, and ships that log to
**MBI Atlas** for org-level adoption analysis.

> **What it measures + what matters most → [`docs/what-the-harness-measures.md`](docs/what-the-harness-measures.md)**
> (includes an honest **per-signal status** table — what actually flows today vs. what's pending). **How each
> metric is computed (the correctness SoT) → [`docs/metric-definitions.md`](docs/metric-definitions.md)** —
> definition · window · the trap · golden-test, per card; Atlas implements its math against it. **The
> CTO/VP exec view (the 5 trends that matter, vs the operational drill-down) → [`docs/exec-view.md`](docs/exec-view.md).**
> The thesis: *measure what **survives***. Four outcome signals (all client-side, no CI/webhooks) are designed
> to feed the Atlas **FASTER / BETTER** scorecard: **`ticket_transition`** (real cycle-time, QA-wait segmented
> out), the **commit symbol fingerprint** (`commit.fp` — rework = the *same logical unit* returning) + reopens,
> the **`gate_run:fail`** fix (failing gates captured, not silently all-`pass`), and **`test_strength`** via
> **`npm run mutation:emit`**. **Status:** all four now **emit** — `gate_run:fail` + `commit.fp` (MBI-23) and
> `ticket_transition` (FASTER), whose emission is wired into `/align` `/tdd` `/ship` (MBI-46). Two things
> still gate the dashboard: **rollout** (devs must run the updated plugin) and the **Atlas FASTER/BETTER
> cards (MBI-24) — not built yet**. Attributed **by ticket**, reported as trends — never a per-person score.

**It is ALWAYS on — collection is mandatory org-wide (company policy, MBI-60).** The Atlas endpoint + ingest
token are baked into `bin/usage-upload.js`, so devs need **zero config**. You can **rotate** the endpoint/token
via Claude Code settings `env` (FleetDM pushes these as managed settings), but there is **no env opt-out** — a
user or MDM `HARNESS_TELEMETRY_ENABLED=false` is **ignored**. The only way to turn collection off is a plugin
**release** that ships an empty endpoint — never config. (This is mandatory *work-product metadata* — counts,
no code/prompts/PHI — disclosed here so it's transparent, not silent.)

```jsonc
// .claude/settings.json (or managed settings) → "env"  — rotation only; collection can't be disabled here
{ "env": {
    "HARNESS_TELEMETRY_ENDPOINT": "https://…/atlas/api/harness/usage",  // override the baked-in default
    "HARNESS_TELEMETRY_TOKEN": "<rotated token>"
} }
```

`bin/usage-upload.js` runs on **SessionStart, turn-end (Stop), and SessionEnd** — **inline but strictly time-boxed**
(≤2.5s budget; throttled to ~once/2h so the dashboard is never more than ~2h stale, even inside one long
session that's never restarted). **The throttle is bypassed when the harness version changed since the last
upload** (flush-on-update), so a dev updating the plugin reflects on the dashboard within a rollup cycle
instead of lagging up to 2h. It backfills any un-sent days and ships only the new bytes of the current day in ≤32KB
**chunks** — so a large day ships in pieces (the byte-offset cursor advances per chunk) and no single POST
can outlive the timeout. Delivery is **at-least-once with no data loss**: the offset advances only after the
server 200s a chunk, and every record carries a stable `id` so a retried duplicate is dropped server-side.
Records also carry the git company email (`userId`) and harness version (`hv`); the server appends them to
`harness-telemetry/<email>/<date>.jsonl`. Identified employee telemetry should be backed by a written
monitoring policy (+ EU DPIA) — see `docs/usage-coaching-prd.md`.

**Per-ticket attribution (recompute-complete).** Work events (`session_start`, `commit`, `gate_run`,
`prompt`, …) carry the branch-derived `issueKey`, so metrics roll up by **ticket**, not by session (sessions
are churned for context hygiene and are the wrong denominator). The issue's **relation** (parent / epic /
links) — plus its **type and priority** — ships once per ticket per session as an immutable, point-in-time
`issue_meta` fact, captured at `/align` (the engineer's own Jira). This is the only place these reach the
backend: the local `issue-graph.json` is mutable and never uploaded, and the analytics backend **can't query
Jira** (every team uses a different one) — so the producer must carry the facts. A later re-parenting can't
corrupt the past. The switch nudge logs its **raw inputs** (`newKey`, `relatedTo`,
`thresholdK`, `contextBucket`) next to the **derived** verdict (`tier`, `nudged`) — so the relatedness rule
or the size threshold can be re-decided over history with no backfill. Atlas reuses these facts (it never
re-implements relatedness), keeping the dashboard consistent with the warning the engineer actually saw.

**Smart-zone reminder.** When you bring an *unrelated* new ticket into a session already carrying a lot of
context, the harness shows a one-time nudge to start a clean session (better quality + cheaper turns — the
[smart zone](#non-negotiable-principles)). It's folded into the existing prompt hook (no per-turn cost) and
only triggers on a genuinely new ticket key past a context-size threshold. Tune with
`HARNESS_ISSUE_NUDGE_TOKENS` (default 40000 — cost-tuned for $20 plans; org can raise/lower via managed
settings) or disable with `HARNESS_ISSUE_NUDGE=off`.

## Contributing a skill

Read `skills/writing-great-skills/SKILL.md` first, then `docs/authoring.md`. Every skill is reviewed
against that meta-skill (checkable criteria, no duplication, explicit anti-patterns) and dog-fooded
once before merge.

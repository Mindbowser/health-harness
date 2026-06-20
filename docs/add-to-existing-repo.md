# Add MB Health Harness to an existing repo — one-pager

Works on **any** repo — a customer's old codebase, a half-finished project, anything. It adds a
discipline + healthcare guardrails on top; it does **not** rewrite your code or impose MB boilerplate.

## 1. Install the harness (run inside your repo)

```bash
claude plugin marketplace add Mindbowser/health-harness --scope project
claude plugin install mb-harness@mindbowser --scope project
```

Commit the resulting `.claude/settings.json` so your whole team gets it. Restart Claude Code (or
`/reload-plugins`); verify with `claude plugin details mb-harness@mindbowser` (→ Skills 11). You keep
any repo-specific skills you already have — the harness adds the shared ones on top.

## 2. Declare what data the repo handles (30 seconds)

Create `.mb-harness/compliance.json`:

```json
{ "profile": "hipaa", "dataClasses": ["phi", "pii", "secrets"], "allow": [], "deny": [], "notes": "" }
```

**Default is `hipaa`** (assume PHI — the safe choice). Use `pci` / `gdpr` / `none` only if the repo
genuinely handles no health data (and say why in `notes`).

> **Shortcut:** just type **`/start`** — it detects this is an existing repo, sets the profile, and
> runs the step below for you. Steps 3–5 are what it routes into.

## 3. Make it agent-ready — run `/onboard-existing-codebase`

This is the brownfield front door. It will:
1. **Read your repo** and write a `CLAUDE.md` (stack, how to run, how to test, architecture, conventions).
2. **Check the feedback loop** — your one command that runs tests + typecheck + lint. **If you don't
   have one, it writes characterization tests first.** Rule: *no agent builds until a green gate exists.*
3. **Baseline-scan for leaks:** `node <mb-harness>/bin/redaction-scan.js --path .`

## 4. Build with the loop

For each change: `/align` (agree what we're building — BA/PM + dev) → `/to-prd` → `/to-issues` (vertical
slices that fit *your* architecture) → `/tdd` (test-first, run the gate every step) → human QA.

## 5. Before anything leaves the repo

Run the redaction check — `node <mb-harness>/bin/redaction-scan.js --path <what-you're-sharing>` —
on any handover doc, demo, or generated artifact. It blocks PHI/PII/secrets. And keep logs clean
(`/safe-logging`): log record IDs, never patient data.

---

### What changes vs. greenfield

| | Greenfield (new repo) | Existing repo (brownfield) |
|---|---|---|
| Front door | `/scaffold-from-boilerplate` | `/onboard-existing-codebase` |
| Feedback loop | ships in the boilerplate | **you must confirm/build one first (hard gate)** |
| Conventions | MB boilerplate | **theirs — match, don't replace** |
| Everything after | identical Build Loop | identical Build Loop |

### FAQ

- **Does it touch my code?** No. It adds `.mb-harness/compliance.json` and a `CLAUDE.md`; the rest is
  skills the agent follows. It won't reformat or refactor unless you ask.
- **No tests in the repo?** That's expected on old code — the onboarding step adds characterization
  tests around the area you're changing, so the agent has a safety net before it edits anything.
- **Not React/TypeScript?** Fine — the loop is stack-agnostic. Only the (future) stack packs are
  language-specific.

---
name: harness-help
description: Show what the MB Health Harness is and how to use it — the in-plugin guide, no repo access needed.
disable-model-invocation: true
argument-hint: "(optional) a section to expand — e.g. 'governance', 'commands'"
---

The portable overview of the harness, for anyone who installed the plugin but **can't see the repo's
README**. When invoked, **present the guide below to the user** in plain language. If they passed a
section name, expand that part; otherwise show the whole overview and offer to go deeper.

## Present this overview

**What it is.** A repeatable discipline for building software *with* AI agents — the timeless
engineering fundamentals (feedback loops, tests you trust, small reversible steps, clear interfaces /
deep modules, human review), re-applied so they survive AI-speed. For Mindbowser the focus is
**healthcare**, so it adds compliance guardrails on top. AI changed *how fast* code is written, not what
makes it good — this keeps the fundamentals in place while you move fast.

**Start here:** `/start` — run once per repo. It detects new vs existing code, sets the compliance
profile (default `hipaa`), and routes you in.

**The two verbs you actually use:**
- **`/align <ticket>`** — refine an item into acceptance criteria + vertical slices, pushed to Jira. It
  runs PRD + slicing for you (you don't call those by hand).
- **`/tdd`** — build the grabbed slice: failing test → minimal code → refactor, against the gate.

**The Build Loop:** `/align` → (PRD + slice, automatic) → `/tdd` → QA. The ticket walks **To Do → In
Progress → In Review → Done**, and a worklog is logged from your git activity (you confirm the time).

**Governance (automatic, gated on the compliance profile):**
- Compliance profile (`hipaa` default / `pci` / `gdpr` / `none`).
- **Redaction check** before anything leaves the repo (no PHI/PII/secrets).
- On ePHI paths: **PHI-safe logging** (log ids, never PHI) + **audit logging** (who accessed what).
- **The wall** — a hook that *blocks* catastrophic actions and *asks* before outward ones (push, PR,
  Jira writes, a commit on the base branch).

**All commands:** `/role` · `/start` · `/scaffold-from-boilerplate` · `/onboard-existing-codebase` ·
`/compliance-profile` · `/sprint` · `/import-issues` · `/align` · `/to-prd` · `/to-issues` · `/tdd` ·
`/phi-redaction-check` · `/safe-logging` · `/audit-logging` · `/writing-great-skills` · `/harness-help`.

**Hooks & tools (run under the hood — you don't call these directly):**
- **The wall** — `hooks/outward-guard.js`, a `PreToolUse` hook. **Blocks** catastrophic actions
  (force-push, `rm -rf /`, drop/truncate table, …) and **asks** before outward ones (push, PR, MCP/Jira
  writes, a commit on the base branch). Always on once the plugin is installed.
- **Redaction scanner** — `bin/redaction-scan.js`, the deterministic PHI/PII/secrets scan behind
  `/phi-redaction-check`.
- **Worklog suggester** — `bin/worklog-suggest.js`, proposes a Jira worklog time from your git activity
  (used by `/tdd`; you confirm the number).

**Go deeper (if you have repo access):** the repo `README.md` (the flow diagram), `COMMANDS.md` (every
command mapped to its Agile ceremony + SDLC phase), and `CONTEXT.md` (the vocabulary).

## Anti-patterns

- ❌ Dumping the raw command list with no explanation — lead with *what it is* and the *two verbs*.
- ❌ Inventing commands or behavior not listed here — if unsure, point to `COMMANDS.md`.

## Completion criteria

- [ ] The user saw the what-it-is + start + two-verbs + governance overview (or the section they asked for).
- [ ] Offered to expand a section or point to the deeper docs.

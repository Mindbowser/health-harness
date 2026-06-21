# CH Team — Harness Onboarding & How to Use (no PM/BA)

Simple guide for the ConnectHealth team. There's **no PM/BA on CH**, so the **Lead** does the upfront
alignment, **engineers** build, and **QA** verifies. The harness handles the BA's "turn a ticket into a
spec" job for you.

## Who does what

| Role | Owns | Skills they run |
|---|---|---|
| **Lead** | Turn tickets into clear acceptance criteria; slice big work; pull Arun/customer for product calls | `/align`, `/to-issues` |
| **Engineers** | Build each slice test-first and publish it | `/align` (build-prep), `/tdd`, `/ship` |
| **QA** | Verify the slice against the criteria in the running app, then close the ticket | (verifies; uses the PR's criteria→test map) |

## 1. One-time setup — every person, once

Install globally (works in every repo after this):
```
claude plugin marketplace add Mindbowser/health-harness
claude plugin install health-harness@mindbowser
```
Then **restart Claude Code** and check: `claude plugin list` → shows `health-harness · Scope: user · enabled`.
Make sure your git email is your **@mindbowser.com** address.

## 2. One-time per repo

Open the repo and run **`/start`** — it sets the compliance profile, confirms a one-command test gate, and
links Jira. (The Lead/Arun can do this once per project.)

## 3. The daily flow

**Lead — before an engineer picks up a ticket:**
1. **`/align <TICKET>`** — turns the ticket (even a one-liner) into acceptance criteria (Given/When/Then) +
   the PHI-safe / audit points. Answer what you can; pull **Arun or the customer** only for the 1–2 real
   product decisions.
2. **`/to-issues <TICKET>`** — if it's big, slice it into vertical sub-tasks. (Skip for small tickets.)

**Engineer — for each slice:**
1. **`/align <SLICE>`** — quick build-prep: ground the criteria in the real code, confirm approach + edge cases.
2. **`/tdd <SLICE>`** — build it test-first (red → green → refactor); the gate runs after each change; it
   produces a proof summary (criteria → test map).
3. **`/ship <SLICE>`** — push → open PR → move the ticket to **In Review** → log the worklog. Each step asks
   you first.

**QA:**
- Verify the slice against the acceptance criteria **in the running app**. The PR's criteria→test map makes
  this fast. Move the ticket to **Done** when it passes; bounce it back with the failing criterion if not.

## One-line tickets — read this

A one-line ticket is **not** a reason to skip `/align` — it's the reason to **use** it. `/align` asks the
questions a BA would and writes the criteria for you.

> Example: ticket says **"Add forgot password."** `/align` surfaces: what if the email isn't registered?
> token expiry? rate-limiting? error states? no PHI in logs or the reset email? → now it's a real spec you
> can build and test, instead of guessing and reworking.

**Rule of thumb: short ticket = `/align` is doing the BA's job for you.**

## Cheat sheet

- **Lead:** `/align <ticket>` → (`/to-issues` if big)
- **Engineer:** `/align <slice>` → `/tdd <slice>` → `/ship <slice>`
- **QA:** verify vs criteria → move to Done
- **Help:** `/harness-help`  ·  **Update:** `/harness-update` (or you'll get an "update available" nudge)

## A few rules that matter (CH / healthcare)

- **No real PHI** in code, tests, or logs — use synthetic data. The harness runs a redaction check before
  anything leaves the repo (PRs, Jira comments).
- **Work on a branch.** The wall stops commits on the base branch and blocks force-push.
- **Don't skip the gate (tests).** Green must mean it actually works — never bypass it to "make it pass."

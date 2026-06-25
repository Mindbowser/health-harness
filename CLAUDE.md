# Mindbowser Health Harness — agent instructions

You are working in a Mindbowser project that has installed the **Mindbowser Health Harness**. Follow this
discipline. It overrides ad-hoc habits. Keep it lean; detail lives in `CONTEXT.md` and each skill.

## The Build Loop

Software here is built in five phases. Know which one you're in.

1. **Align** (`/align`) — reach a shared design concept with the humans *before* planning. Don't jump
   to a plan. Human-in-the-loop.
2. **PRD** (`/to-prd`) — capture the alignment as a disposable destination doc.
3. **Slice** (`/to-issues`) — break work into **vertical slices** (a thin path through every layer:
   schema→API→UI→tests), never horizontal layers. Issues carry blocking relationships.
4. **Build (AFK)** (`/tdd`) — implement one unblocked slice at a time with TDD red-green-refactor,
   running the repo's one-command gate after every change. Loop until done.
5. **QA** — fresh-context review of tests → code → manual QA. Humans impose taste here.

## Non-negotiable rules

- **No AFK build without a feedback loop.** If the repo has no one-command gate (tests + typecheck +
  lint), establishing one is the *first* task — for a customer's existing codebase, this is a HARD
  GATE: write characterization tests before changing behavior. Feedback loops are the quality ceiling.
- **Vertical slices only.** A slice must be demoable/verifiable end-to-end. Reject horizontal slicing.
- **TDD for all AFK work.** Write the failing test first (RED), minimal code to pass (GREEN), refactor.
  Never write all the implementation then backfill tests.
- **Stay in the smart zone.** Size tasks small. Prefer clearing context and re-reading state over
  compacting a bloated conversation. Keep system prompts tiny.
- **Deep modules.** Design clean interfaces; put richness inside. Don't scatter shallow modules.
- **Inherit the alignment, not just the artifact.** If you're implementing work someone else aligned,
  read the PRD AND confirm the design concept (a quick `/align` over it) before slicing.

## Governance (healthcare — non-negotiable)

- **Respect the repo's `compliance-profile`** (`hipaa` | `pci` | `gdpr` | `none`). **The default is
  `hipaa`** — absent config means assume PHI, not `none`. Never emit real PHI/PII/secrets into code,
  tests, fixtures, logs, commits, or customer-facing artifacts — use synthetic, fake-but-realistic data.
- **Run the redaction check before anything leaves the repo** (customer-facing docs, handover, demos).
- **On a customer's codebase:** respect THEIR conventions and IP. Do not impose MB boilerplate, do not
  exfiltrate code, do not rewrite architecture you weren't asked to.

## Roles

BA/PM are accountable for **Align + PRD** (the Dev must be in the `/align` session). Dev/Tech-lead
leads **Slice**. The agent does **Build (AFK)** under Dev oversight. **QA** is shared (Dev: code/tests;
BA/PM: acceptance). Whoever runs the build inherits the alignment, not just the document.

## Vocabulary

Use the terms exactly as defined in `CONTEXT.md` (Build Loop, vertical slice, gate, smart zone, deep
module, archetype, compliance profile, …). One word, one meaning.

## Maintaining this repo (the harness itself)

- **Docs-sync gate.** When you add or change a **user-facing feature** — a skill, a hook/wall rule, a
  `bin/` tool, or a flow/lifecycle change — update **`README.md`** in the **same change**, and its **flow
  diagram (mermaid) + the Build Loop table** if the flow or lifecycle changed. Bump the version
  (`plugin.json`, `marketplace.json`, `package.json` — **all three must agree**). A feature change that
  leaves the README/diagram stale is **incomplete** — don't merge it. (Full authoring contract:
  `skills/writing-great-skills`.)
- **Release gate — every push to `main` releases.** This repo IS the plugin/marketplace, so `main` is the
  release channel: never push `main` without cutting a release. After committing the version bump, run
  **`npm run release`** (`bin/release.js`) — it verifies you're on a clean `main` with the three manifests
  agreeing, runs the gate, pushes `main`, then creates + pushes the tag **`health-harness--v<version>`**
  (lightweight-style annotated tags; no GitHub Releases). If you ever `git push origin main` by hand, you
  MUST follow it with the matching tag. A pushed `main` commit with no new tag is an incomplete release.
  (This applies ONLY to the harness repo — never auto-release a customer's repo.)

## Repo facts (onboarded 2026-06-25)

Durable facts live in `.health-harness/project.json` + `.health-harness/compliance.json` (both committed).
Skills read these instead of re-deriving — don't re-query.

- **Stack:** Node.js (CommonJS), `node:test`. No build step. It's a Claude Code plugin/marketplace.
- **Gate (one command):** `npm test` — `node --test`, ~132 tests across `test/*.test.js`, currently green.
  Every `bin/` tool has a sibling test; add the test in the same change (TDD).
- **Compliance profile:** `hipaa` — the wall (`hooks/outward-guard.js`) reads this to scan outbound
  payloads, so it's kept hot even though the repo ships no PHI itself (maintainers handle MBI/customer
  data; the test suite encodes hipaa-level wall behavior). `none` disables PHI egress scanning + fails
  the gate — don't. Baseline `redaction-scan` flags only synthetic MRN/DOB fixtures under `test/`
  (source files, never outbound) plus the scanner's own secret fixtures — all expected, not real.
- **Seams:** each feature = one `bin/<tool>.js` (pure logic, unit-tested) wired in via `hooks/hooks.json`
  (+ `hooks/outward-guard.js`, the wall) or a `skills/<name>/SKILL.md`. Change behavior in `bin/` with a
  failing test first; surface it through hooks/skills. `CONTEXT.md` is the vocabulary source of truth.
- **Git/commit convention:** branch `feature/<KEY>-<slug>`, PR to `main`; commits are conventional AND
  ticket-keyed (`feat(scope): … (MBI-NN, vX.Y.Z)`). Keep both — the wall format-gates commit messages.

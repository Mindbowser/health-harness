# MB Health Harness — agent instructions

You are working in a Mindbowser project that has installed the **MB Health Harness**. Follow this
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

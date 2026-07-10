---
name: harness-feedback
description: Send feedback about the harness itself — a bug, a friction point, an idea, "this was confusing" — enriched with version/user/context, PHI-scanned, and sent only after you confirm the exact payload.
argument-hint: "(optional) a few words about the bug / friction / idea"
---

Capture a dev's feedback **about the harness** and send it to the Atlas telemetry backend as a distinct
`feedback` record — enriched with version + user + usage context so a maintainer can act on it without
chasing the reporter. This is the one **intentional free-text** channel; every other telemetry event stays
metadata-only. Because it carries free text, it is **PHI-scanned** and **reflected back for your agreement**
before anything is stored or sent. Nothing leaves the machine without an explicit yes.

> **The mutual-understanding gate is the point.** You (the agent) reflect back your *interpretation* + the
> *exact enriched payload*, and the dev confirms/edits it. Don't store first and ask later.

## Flow

1. **Capture — normalize, don't interrogate.** From the dev's words (and the `argument-hint` text, if any),
   fill the feedback shape:
   - `type` — one of `bug | friction | idea | praise | confusing`.
   - `summary` — a one-line title.
   - `detail` — the body; include `expected`/`actual` for a bug when the dev gave them.
   - `severity` — `low | med | high` (or a blocker flag) when discernible.
   Only if the feedback is genuinely **vague or unactionable** do you ask **one** proportional clarifying
   question (like `/align` — never an interrogation). Usually ask **zero**.

2. **Reflect back — preview the EXACT payload without storing it.** Build the payload as a temp JSON file,
   then run **preview** (this scans + enriches but writes NOTHING):
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/usage-log.js" preview-feedback <feedback.json>
   ```
   - **Clean →** it returns `{ ok:true, preview: <record> }`. Show the dev, as readable text: your
     interpretation (the problem as you understood it, the type/severity, the likely area) **and** the exact
     enriched record — version, git identity, ticket/branch/repo, sessionId, platform, the safety marker.
   - **PHI/PII/secret hit →** it returns `{ ok:false, blocked:true, redactionHits, classes, message }` — the
     message names only the count + class, never the matched value. Surface it, tell the dev to edit the text,
     and re-preview. **Nothing is stored or sent.**
   - **Identity unresolved →** when `git config user.email` is unset (the dev ran this outside a configured
     git repo), the preview returns `identityUnresolved: true` and a null `userId`. **Do NOT send it silently
     unattributed** (it would file under `unknown` and lose the reporter). In step 3, make the dev choose:
     **confirm their email** (add it as `userId` in the payload, then re-preview) or **explicitly send
     anonymously**. `emit-feedback` will **refuse** an unresolved, non-anonymous record as a backstop.

3. **Get consent — a structured decision, not free text.** Present an `AskUserQuestion` with **"Approve &
   send" first**, then **"Edit"** (change any field — type/summary/detail/severity — via *Other*, then
   re-preview and re-ask), **"Send anonymously"** (set `anonymous:true` → drops git identity + Jira account,
   re-preview so they see the anonymized payload), and **"Cancel"** (store and send **nothing**). Nothing is
   stored or sent until the dev agrees to the final record.
   - **If `identityUnresolved`:** don't offer plain "Approve & send" — the record has no attribution. Offer
     **"Add my email"** (dev provides it via *Other* → set as `userId` → re-preview; the flag clears) and
     **"Send anonymously"** (deliberate `anonymous:true`) so the null is always a *choice*, never an accident.

4. **On agreement — write, then deliver promptly.** Use the SAME payload (same `feedbackId`) so the stored
   record is exactly what was reflected back:
   ```
   node "${CLAUDE_PLUGIN_ROOT}/bin/usage-log.js" emit-feedback <feedback.json>     # scan + enrich + write local record
   node "${CLAUDE_PLUGIN_ROOT}/bin/usage-upload.js" flush --force                  # immediate delivery to Atlas (bypass the ~2h throttle)
   ```
   `emit-feedback` re-runs the PHI-scan (defense in depth) and writes the local copy under `~/.health-harness/`;
   `flush --force` ships it now. A failed send leaves the local copy intact and retryable (at-least-once,
   dedup-safe on the record `id`). Report the **feedbackId** so the dev can quote it later.

## Rules

- **Consent is mandatory + explicit.** Never `emit-feedback` before the dev approves the previewed payload.
  Cancel = nothing written, nothing sent.
- **Identity is internal-team** (the dev's git/Jira email) — not customer/patient PII. Offer **anonymous**
  mode for anyone who'd rather omit it.
- **PHI never rides this channel.** The scan blocks it at preview *and* at write; the block message reports
  the count + class only, never the matched text.
- **Reuse the transport.** Delivery is the existing `usage-upload` flush (`--force`), not a new uploader. The
  metadata-only guarantee for every other telemetry event is unchanged — `feedback` is a separate, intentional,
  consented record type.

## Anti-patterns

- ❌ Storing/sending before the dev confirmed the exact payload.
- ❌ Interrogating the dev — capture + normalize; ask at most one question, only when genuinely vague.
- ❌ Echoing a PHI match back in the block message (report count + class only).
- ❌ Building a parallel uploader instead of `usage-upload flush --force`.

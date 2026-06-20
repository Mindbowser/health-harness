---
name: phi-redaction-check
description: Scan anything customer-facing for PHI/PII, secrets, and disallowed content before it leaves the repo; block on a hit.
---

Scan content that is about to leave the repo — a customer-facing doc, a demo, a handover, generated
code, a commit — for **PHI/PII, secrets, and other disallowed classes**, and **block** if anything is
found. This is the safety part of the harness: it's what lets us ship AI-built software fast in a
regulated domain without leaking. A hit is a hard fail, not a warning.

## Driven by the compliance profile

Read `.mb-harness/compliance.json` first (see `/compliance-profile`). The `dataClasses` there decide
which families below are enforced. **`secrets` is always enforced**, even for profile `none`.

## What to scan for, by class

In a real client/delivery repo the classes that matter are **secrets + PHI/PII** (and PAN for
payments). There is no deal data in a delivery repo, so the commercial classes are **not** part of the
standard scan — see the Studio-only note below.

- **secrets** (always, every repo) — API keys, OAuth/JWT tokens, AWS keys (`AKIA…`), private keys
  (`-----BEGIN … PRIVATE KEY-----`), DB connection strings, passwords in config/code/logs.
- **phi** (`hipaa`) — patient names tied to records, MRNs, SSNs, dates of birth, addresses, phone
  numbers, and health facts attached to an individual.
- **pii** (`hipaa`/`gdpr`) — real person names, personal emails/phones, postal addresses, national IDs.
- **pan** (`pci`) — primary account numbers / card numbers (13–19 digits, Luhn-valid), CVV, expiry.

> **Studio-only (opt-in, not for client repos):** the `commercial` class — deal $ amounts, deal stages
> (`Closed Won/Lost`), sentiment/win-probability, MB staff, other-customer names — guards *sales-derived*
> artifacts (Studio prototypes) where pipeline data could leak. It only applies when a repo explicitly
> adds `"commercial"` to its `dataClasses`. Don't enable it on a normal delivery repo. This is the class
> mbi-studio's `redaction-validator.js` already implements.

## Process

1. **Read the profile** to get the active `dataClasses` and `allow` list.
2. **Run the deterministic scanner — and scan the DIFF, not the whole repo.** The per-PR gate must flag
   only what *your change* introduces; on a real repo a whole-tree scan drowns in pre-existing fixtures
   (one CH repo: 261 baseline hits). Use:
   - `node bin/redaction-scan.js --staged` (pre-commit) or `--changed <base>` (vs a branch) → only
     changed files. **This is the routine per-PR/per-commit default.**
   - `--path <dir>` → whole-tree, **only for a deliberate baseline audit**, never the routine gate.
   - `--json` for clean machine output. Auto-loads `.mb-harness/compliance.json` (default `hipaa`),
     exit 1 on hits, returns `{ file, line, class, snippet }`. Pattern matching beats eyeballing.
3. **Pre-existing baseline ≠ your problem.** Hits in files you didn't touch are the repo's baseline
   (synthetic fixtures, example ARNs). Don't try to fix them — diff-scoping (step 2) excludes them.
4. **Respect `allow`** — exact-string exemptions only (confirmed false positives).
5. **On any hit: BLOCK.** Report file:line + class + snippet. Do not redact-in-place silently and
   proceed — surface it so a human fixes the source (or adds a true false-positive to `allow`).
6. **No real data as the fix.** Replace leaked PHI/PII in fixtures/examples with **synthetic**
   fake-but-realistic data; never just move the real value elsewhere.

## Anti-patterns

- ❌ "Looks fine to me" instead of running the scanner. Manual reading misses encodings and edge cases.
- ❌ Treating a hit as a warning and shipping anyway.
- ❌ Adding real regulated values to `allow` to pass the check.
- ❌ Scanning built/vendored dirs (false positives) or, worse, skipping the actual export.

## Completion criteria

- [ ] The active `dataClasses` from the profile were all scanned.
- [ ] The deterministic scanner ran (or its absence is flagged as a gap to fix), scoped to the export.
- [ ] Zero hits remain, OR every remaining match is a confirmed false positive in `allow`.
- [ ] Any test/example data is synthetic, not real.

> **Backing implementation (built):** `bin/redaction-scan.js` in this repo — zero-dep, profile-driven,
> default classes `secrets` + `phi`/`pii` (+ `pan` for `pci`), with `commercial` behind the opt-in
> class. API: `scanText` / `validate` / `loadConfig` / `classesForProfile`; CLI `--path`/`--profile`.
> Tested in `test/redaction-scan.test.js` (`npm test`). Names/free-text PII can't be regex'd — pass
> known strings via `deny` in `compliance.json`; this catches patterned identifiers (SSN, email, phone,
> card, keys, MRN/DOB labels). Modeled on mbi-studio's `redaction-validator.js`, scoped to delivery repos.

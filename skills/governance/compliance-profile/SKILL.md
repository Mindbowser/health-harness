---
name: compliance-profile
description: Declare or read a repo's compliance profile (hipaa/pci/gdpr/none) so the right governance auto-applies.
---

Establish (or read) a repository's **compliance profile** — a single declaration of what regulated data
the project handles. Every other governance behavior (the redaction check, synthetic-data rules,
what's allowed in commits/logs) keys off this. Set it once at repo init; read it before any
customer-facing output.

## The declaration

The profile lives at `.mb-harness/compliance.json` at the repo root:

```json
{
  "profile": "hipaa",
  "dataClasses": ["phi", "pii", "secrets"],
  "allow": [],
  "notes": "Customer X engagement — PHI in the patient module; PCI out of scope."
}
```

- **`profile`** — one of `hipaa` | `pci` | `gdpr` | `none`. Picks the default rule set + redaction classes.
- **`dataClasses`** — the families the redaction check enforces (see `phi-redaction-check`). Derived
  from `profile` by default; list them explicitly to add/override.
- **`allow`** — exact strings exempt from redaction (e.g. a public brand name, the author byline, a
  customer's own staff name that collides with a pattern). High-precision; keep it short.
- **`notes`** — human context: what data lives where, what's explicitly out of scope.

## Profiles → default data classes

| `profile` | Enforced classes | Use for |
|---|---|---|
| `hipaa` | `phi`, `pii`, `secrets` | Anything touching patient / health data |
| `pci` | `pan`, `pii`, `secrets` | Payment-card data |
| `gdpr` | `pii`, `secrets` | EU personal data, no health/payment |
| `none` | `secrets` | Internal tools, no regulated data (secrets are *always* enforced) |

## Process

1. **Read first.** If `.mb-harness/compliance.json` exists, load it and obey it — do not re-ask.
2. **If absent, set it.** Ask the user (or infer from the engagement) which profile applies; confirm
   the data classes; write the file. **`secrets` is always included** regardless of profile.
3. **Surface it.** Note the active profile in the repo's `CLAUDE.md` so every agent session sees it.
4. **Re-evaluate on scope change.** Productionizing a prototype with real data, or a customer adding a
   payments feature, changes the profile — update the file.

## Anti-patterns

- ❌ Proceeding with no profile on a customer/healthcare repo. Absent ≠ `none`; ask.
- ❌ Putting real regulated data in `allow` to silence the check. `allow` is for false positives only.
- ❌ Duplicating the profile in multiple files. The JSON is the single source of truth.

## Completion criteria

- [ ] `.mb-harness/compliance.json` exists with a valid `profile` and explicit `dataClasses`.
- [ ] `secrets` is in `dataClasses`.
- [ ] The active profile is reflected in the repo `CLAUDE.md`.
- [ ] `allow` contains only confirmed false-positive strings (no real regulated data).

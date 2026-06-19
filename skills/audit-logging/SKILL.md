---
name: audit-logging
description: Record who accessed or changed PHI/ePHI — the HIPAA audit trail. Distinct from safe-logging; both are needed.
---

Implement an **audit trail**: a deliberate, tamper-evident record of *who accessed or changed which
ePHI, when*. This satisfies the HIPAA Security Rule **audit controls** (§164.312(b)) and
information-system-activity review (§164.308(a)(1)(ii)(D)). Driven by the repo's `compliance-profile`
(required for `hipaa`; GDPR has accountability needs too).

## Audit logging vs. safe-logging — both, not either

- **`safe-logging`** keeps PHI *out* of operational/error logs.
- **`audit-logging`** deliberately *records access events* to ePHI for accountability.

They cooperate: the audit log records **references** (user id, record id, action) — **never the PHI
values themselves** — so it still honors the safe-logging rule. The audit log is a separate, secured,
retained store, not your app's debug log.

## What to audit

Every event that touches ePHI:
- **Reads** — viewing/exporting a patient record or report.
- **Writes** — create / update / delete of ePHI.
- **Auth** — logins, logouts, failed auth attempts.
- **Authorization changes** — role/permission grants affecting ePHI access.
- **Bulk/export operations** — downloads, report generation, API pulls of ePHI.

## What each entry records

- **Who** — authenticated user/actor id (+ role).
- **What** — action (`read`/`create`/`update`/`delete`/`export`/`login`…) + resource type + **record id**.
- **When** — UTC timestamp from a synced clock.
- **Where** — source IP / session / service.
- **Outcome** — success or failure (and why, e.g. denied).
- **NOT** — the PHI field values. Reference the record by id; never copy its contents into the audit entry.

## Properties (the HIPAA-grade part)

- **Append-only / tamper-evident** — entries can't be edited or silently deleted (write-once store,
  hash-chain, or a managed audit service).
- **Access-controlled** — the audit log itself is restricted and is itself audited.
- **Retained** — per policy; HIPAA practice is **≈6 years**. Don't auto-purge inside that window.
- **Time-synced & queryable** — reconstruct "who saw patient X's record last month" for an investigation.
- **Centralized at a seam** — emit from a single audit service / middleware at the data-access boundary,
  not scattered per call site (so coverage is provable and consistent).

## Verification (build a feedback loop)

- A test that hits a PHI **read** path and asserts an audit entry is emitted with who/what/when/where/outcome.
- A test that a **denied** access still produces an audit entry (failures are audited too).
- A test that the audit entry contains the record **id** but **no PHI field values**.

## Anti-patterns

- ❌ Conflating audit logs with app logs — different store, different retention, different access rules.
- ❌ Putting PHI values in the audit entry (reference by id).
- ❌ Auditing only writes — **reads of ePHI must be audited too**.
- ❌ Per-call-site audit calls that drift — emit from one seam so coverage is complete.
- ❌ Mutable/purgeable audit storage — it must be tamper-evident and retained.

## Completion criteria

- [ ] ePHI reads, writes, auth events, and authz changes all emit audit entries from a central seam.
- [ ] Each entry has who / what(+record id) / when / where / outcome, and **no PHI values**.
- [ ] The audit store is append-only/tamper-evident, access-controlled, and retained per policy (~6y for HIPAA).
- [ ] Tests prove a read path (success AND denied) emits a correct, PHI-free audit entry.

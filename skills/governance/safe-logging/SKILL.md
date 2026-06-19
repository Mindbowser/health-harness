---
name: safe-logging
description: Log errors and traces without leaking PHI/PII/secrets — scrub at the logger boundary, log references not identities.
---

Write logging and error handling that is **debuggable but PHI-safe**: full stack traces, error types,
and operation context — but never patient data, PII, or secrets. This is a **runtime** guardrail, and
it's the gap `phi-redaction-check` can't close: that skill scans *static* content before it ships;
logs are generated at runtime, so a clean source file can still emit PHI via `logger.error(err, req.body)`.
Driven by the repo's `compliance-profile`.

## The core problem

The dangerous lines look harmless and pass a static scan:

```ts
logger.info({ patient });                 // dumps name, DOB, MRN…
logger.error("failed", { requestBody });  // PHI in the body
console.log(user);                          // bypasses the logger entirely
catch (e) { logger.error(e); }              // stack args may embed PHI
```

## Rules

1. **Never log PHI/PII/secrets.** No full request/response bodies, no whole domain objects, no auth
   tokens/keys. If the `compliance-profile` enforces `phi`/`pii`, this is non-negotiable.
2. **Log references, not identities.** Emit opaque IDs — `patientId`, `recordId`, a `correlationId`/
   trace id — never names, MRNs, emails, DOBs, addresses, card numbers.
3. **Scrub at the logger boundary.** Configure the logger with a redacting serializer: a **denylist**
   of sensitive field names (`name`, `firstName`, `dob`, `ssn`, `mrn`, `email`, `phone`, `address`,
   `password`, `token`, `authorization`, `card`, …) replaced with `[REDACTED]`, AND a default-deny for
   unknown nested objects so a careless `logger.info({ patient })` is scrubbed automatically.
   (pino `redact`, winston format, or an equivalent serializer.)
4. **Error handling that's still useful.** On catch, log: error **type/class**, a **scrubbed message**,
   the **stack**, the **correlationId**, and **safe operation context** (which operation, which
   `recordId`) — enough to reproduce and locate the failure. Do NOT log the input payload that caused
   it when it may contain PHI; log its id/shape instead.
5. **One logging path.** No raw `console.log`/`print` of objects in app code — they bypass the scrubber.
   Route everything through the configured logger.
6. **Levels don't excuse PHI.** "Just for debug" still ships to log sinks. Debug logs follow the same rules.

## Verification (build a feedback loop for it)

- A **unit test** that logs a synthetic record containing every sensitive field and asserts the emitted
  log line contains the safe IDs but **none** of the sensitive values (use fake-but-realistic PHI).
- The redacting serializer is wired in the logger config, not sprinkled per call site.
- Optionally, a log-sink scan in CI that greps shipped log samples for PHI patterns (defense in depth).

## Anti-patterns

- ❌ Logging whole request/response objects or domain entities.
- ❌ `console.log`/`println` of objects that skips the scrubbing logger.
- ❌ Logging the offending payload in a catch block "to debug it".
- ❌ Per-call-site manual redaction (it drifts; one missed site leaks). Scrub centrally.
- ❌ Relying on `phi-redaction-check` to catch log leaks — it scans static files, not runtime output.

## Completion criteria

- [ ] The logger has a central redacting serializer (denylist + default-deny on unknown objects).
- [ ] Errors log type + scrubbed message + stack + correlationId + safe context (ids, not payloads).
- [ ] No raw `console.log`/`print` of objects in app code; one logging path.
- [ ] A test proves a synthetic PHI record is logged with references only, sensitive values redacted.
- [ ] Behavior matches the repo's `compliance-profile` (`phi`/`pii`/`secrets` as applicable).

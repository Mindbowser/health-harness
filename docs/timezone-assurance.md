# Timezone assurance — from "did you notice" to "survives a hostile clock"

> **Status:** tier 1 (agnostic detector) **shipped** (MBI-83, v0.2.29); tier 2 (hostile-clock gate run)
> **shipped** (`bin/tz-gate.js` + TDD-skill step, v0.2.30). The build-time AskUserQuestion + AFK default
> and tier 3 (matrix-with-coverage) are not yet wired. This *upgrades* the existing `criteria-detect` tz
> tripwire, it doesn't replace it.

## The problem with today's gate

The wall (`hooks/outward-guard.js` via `bin/criteria-detect.js`) does a pure **awareness** check:
a slice that touches a date/time API (`DATETIME_RE`) must carry either a `kind:timezone` criterion
in its manifest or a `// tz-safe:<reason>` annotation, else the push is blocked.

That proves the developer *noticed* timezones. It proves **nothing** about correctness, and the
escape (`// tz-safe: trust me`) is gameable. We want behavioral assurance — without pretending any
gate can give "100% surety" (it can't: TZ correctness is semantic; finite tests can't enumerate all
zones × DST rules × instants).

**The honest target** is not 100%. It is: *"the suite still passes when the machine clock is
hostile — including a DST boundary and a non-hour offset."*

## Two signals, opposite treatment

Block on **facts**. Prompt on **heuristics**. Never warn-and-continue (a warn that lets the push
through is, at AFK time, identical to no gate — nobody reads the stdout).

| Signal | Confidence | Treatment |
|---|---|---|
| **Matrix test fails** under a hostile `TZ` | fact — it's a red test | **Hard fail. No question, no opt-out.** |
| **Date API touched, no marker/criterion** | heuristic — might be a duration/log/UTC-internal | **Prompt at build time** → produces a durable artifact; wall stays a deterministic backstop |

## The adversarial matrix

| Zone | Why it's in the set |
|---|---|
| `UTC` | baseline |
| `Asia/Kolkata` (+5:30) | non-hour offset — breaks naive `getHours`/slot math. **No DST** |
| `America/New_York` | DST transitions — spring-forward gap, fall-back overlap |
| `Pacific/Chatham` (+12:45 / +13:45) | 45-minute offset **and** DST — the nastiest real zone |
| a far-future instant | hardcoded DST rules / 2038-style edges |

### Choosing the CI *default* zone — must differ from the team's home zone, and include DST

Mindbowser dev laptops are overwhelmingly on **`Asia/Kolkata`** (India-based team). That means:

- A developer's everyday `npm test` **already runs under +5:30** — so defaulting CI to Kolkata adds
  ~nothing for them; it's their *home* zone, not a hostile one.
- Kolkata has **no DST** and a fixed offset, so it can never surface the DST bug class.

**Rule: the CI default `TZ` must (a) differ from the team's home zone and (b) have DST.** For an India
team that means the default is a Western DST zone — **`America/New_York`** (or `Pacific/Chatham` for the
meaner 45-min + DST case). Kolkata stays in the *matrix* as the "+5:30 non-hour-offset" probe, but is
**not** the default. (A US-based team would invert this — their hostile default would be Kolkata/Chatham.)

## Tier 1 — keep the cheap tripwire (unchanged)

`criteria-detect` at write-time is a fine "did you even notice" smoke alarm. Keep it. It is the
*first* layer, not the assurance.

### Agnosticism — what is and isn't language/framework-neutral

| Layer | Agnostic? | Note |
|---|---|---|
| `kind:timezone` criterion | ✅ fully | a manifest string tag — no language assumption |
| `tz-safe` marker | ✅ effectively | `TZ_MARKER_RE` substring-matches the line, so `#`, `//`, `--` comments all work |
| Matrix execution (`TZ=…`) | ⚠️ mostly | POSIX `TZ` honored by JS/Python/Ruby/Go/C and Java-on-Linux; **caveats: .NET-on-Windows (registry zones), Java may need `-Duser.timezone`** |
| Detection (`DATETIME_RE`) | ❌ **JS-biased** | matches JS + a couple of Java/Go tokens; **misses Python (`datetime`/`zoneinfo`/`pytz`), Ruby (`Time.now`), C#/.NET (`DateTime`/`DateTimeOffset`), PHP** |

**Action:** make detection truly agnostic via a language-keyed pattern table (pick patterns by the
slice's file extensions), else the gate silently no-ops in a Python/.NET product repo — a worse failure
mode than a loud one.

## Tier 2 — CI defaults to a hostile clock, permanently (✅ shipped, v0.2.30)

Implemented as `bin/tz-gate.js`: `node bin/tz-gate.js --invocation` reads the repo's `project.json` gate +
`timezone.home` and prints the recommended `TZ=<hostile> <gate>` (hostile zone differs from home + has DST).
The TDD skill's timezone-governance step instructs running date-touching slices under it. `timezone.home`
is recorded in `project.json` (`Asia/Kolkata` for this team). The original prototype findings:


Run the gate under a non-UTC default — `TZ=Asia/Kolkata` (or Chatham) — as the *standard* invocation,
not UTC. This catches the entire "works on my UTC laptop, breaks for half the org" class **for free**,
on every test, with zero new test-writing. Most TZ bugs die here.

**Prototype finding (this repo):** `npm test` is green under `UTC`, `Asia/Kolkata`, `America/New_York`,
and `Pacific/Chatham` — 179/179 each. The harness itself is already TZ-robust (it injects timestamps
rather than calling `new Date()` ambiently). **So tier 2's payoff is in the product repos the harness
is installed into, not here** — wire the hostile-default `TZ` into the *product-repo* gate the harness
recommends, and surface a one-line note when a product suite has no non-UTC run configured.

## Tier 3 — matrix the touched slice, with coverage (the real upgrade)

When `criteria-detect` fires on a date API, re-run the **affected** tests across the matrix and require
the date/time lines to be **covered**. Coverage gating is what makes it honest: a marker can be faked;
"the date lines executed under Chatham and the asserts held" cannot. A *failing* matrix run is tier-1's
"matrix test fails" fact → hard block.

## Tier 4 (optional) — property test for genuine date math

For functions doing real date arithmetic, a `fast-check` property over arbitrary instants × arbitrary
zones beats any fixed matrix. Worth it only for real date-math modules, not every `new Date()`.

---

## Build-time flow — the question the TDD skill fires

When the TDD skill is building a slice and `detectDateTimeApi(diff)` is true while neither a
`kind:timezone` criterion nor a `tz-safe` marker exists yet, and **a human is present**, the agent
raises the timezone-impact question *before* the wall ever sees it. The framing carries the teaching
("users in other timezones may be affected"); the options map to **durable outcomes**, so it's a
one-time decision, not a nag.

> **This feature touches dates/times. If it converts or displays user-facing time, users in other
> timezones (and across DST/offset boundaries) can see wrong results. How should this slice be marked?**
>
> | Option | Records | Choose when |
> |---|---|---|
> | **Yes — converts user-facing time** | `kind:timezone` criterion + agent writes the DST/offset **matrix test** | the feature genuinely needs TZ conversion |
> | **No — internal/UTC-only/duration** | `// tz-safe: <reason>` on the line | timestamps stay UTC, or it's a monotonic duration / log time |
> | **Not sure — defer** | tracked TODO + criterion left **open** (does *not* silently pass) | needs a human decision later |

The chosen artifact satisfies (or deliberately defers) the wall deterministically. "Yes" additionally
obligates the slice to a matrix test the agent writes red-green like any other criterion.

## AFK / autonomous default (no human to ask)

The rule can't be "always ask." During autonomous build:

```
date API touched, no marker/criterion?
├─ human present  → AskUserQuestion (above)
└─ AFK            → DECIDE AND RECORD (never silently skip):
     ├─ obviously a duration / internal-UTC / log timestamp → write `// tz-safe:<reason>`
     └─ otherwise (could be user-facing) → SAFE DEFAULT:
          add `kind:timezone` criterion + write the matrix test, build it red-green
   (the wall still backstops the push either way)
```

Bias the AFK default toward *safe* (treat as TZ-relevant) — a needless matrix test is cheap; a missed
conversion bug ships to every user in the wrong zone.

## Wall behavior (deterministic backstop — layer of last resort)

- Date API + no marker + no `kind:timezone` → **block** with the teaching message (today's behavior).
  Acceptable to block because the build-time question already offered a cheap, recorded escape.
- *Future:* a **failing matrix run** → **hard block, no `tz-safe` opt-out** (it's a real bug, not a
  missing acknowledgement).
- The wall never asks interactively (it's a non-interactive push hook) and never warns-and-continues.

## Rollout order

1. **Tier 2 first (cheap, high signal):** make the product-repo gate default to a hostile `TZ`; flag
   suites that have no non-UTC run. Find existing breakage before adding ceremony.
2. **Build-time question:** wire the AskUserQuestion + AFK decision tree into the TDD skill.
3. **Tier 3:** matrix-execute the touched slice with coverage gating; failing run = hard block.
4. **Tier 4:** property tests for the handful of real date-math modules.

Drop "100%" from any spec/marketing. The honest claim is **"survives an adversarial TZ matrix incl.
DST + 45-minute offset."**

# Exec view — the 5 the CTO / VP-Eng watches

> **The whole dashboard answers one question:**
> *"Is AI making us deliver more, faster, without losing quality or safety — and is it taking work off engineers?"*
>
> If a number doesn't help answer that, it's **operational**, not executive — it belongs in the drill-down,
> not on this strip. The exec view is **5 trends read as direction, not decimals.** Companion specs:
> `metric-definitions.md` (how each is computed), `what-the-harness-measures.md` (the signals).

## The five (and nothing else on this strip)

| # | Principle | The one metric | Healthy direction |
|---|---|---|---|
| 1 | **Speed** | Cycle-time (In Progress → Done), median | **↓** |
| 2 | **Quality** | Rework + escaped-defect rate (did it *stay* done) | **↓** |
| 3 | **AI leverage** | **Human-active hours per shipped ticket** | **↓** while throughput holds/↑ |
| 4 | **Safety** | PHI/secret leaks | **= 0** (a floor, not a trend) |
| 5 | **Adoption** | Real adoption % (proper denominator) + % using the disciplined loop | **↑** |

## Why exactly these
- **#1 + #2 are shown together, never apart.** The core first-principle: speed *with* rising rework is fake
  productivity (AI makes fast-slop easy). Velocity alone is vanity; velocity **with** quality holding is the
  real claim. If only one tile survived, it'd be these two side-by-side.
- **#3 is the differentiator.** It's what turns "a good team" into "AI productivity." It's the proof of the
  AFK bet — more output, less hands-on engineer time. (Data already exists in the worklog split.)
- **#4 is binary.** In healthcare, safety isn't optimized — it's *held*. Green, or it's an incident.
- **#5 is the leading indicator** — it tells you whether 1–4 will *spread or stall*. Must use the real
  denominator (active engineers, e.g. git authors), or it reads a tautological ~100%.

## The two rules that keep it honest
1. **Trend, not level.** The CTO question is a derivative — *are we heading the right way*. Show each as
   **vs last period AND vs the pre-adoption baseline**, with an arrow. One readable line:
   *"cycle-time ↓18% vs baseline · rework flat · leverage ↑ · leaks 0 · adoption 60→75% = on track."*
2. **Pair #1 and #2 visually.** Never let someone read speed without quality next to it.

## Two layers, one data set
- **Exec strip (this doc):** the 5 above. For the CTO / VP-Eng. "Are we on track?"
- **Operational drill-down (the existing rich view):** per-dev habit cards, activity trend, prompt quality,
  hygiene-gap breakdown, sessions, gate-pass detail. For VP/managers/devs — *where to help, how to coach.*
  **Demote all of it off the exec strip.** Same data, right altitude per audience.

## What "heading the right direction" looks like
A single glance resolves to a per-pillar status vs baseline — **improving · flat · regressing** — across
Speed, Quality, Leverage, Safety, Adoption. No blended single score (it hides the trade-offs and is
gameable); five honest lights instead. On-track = speed↓ + quality flat-or-↓ + leverage↓ + leaks 0 +
adoption↑. Anything else names itself for the VP to dig into.

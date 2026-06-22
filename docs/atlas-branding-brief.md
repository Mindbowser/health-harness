# Brief for the Atlas agent — Mindbowser branding on the Harness AI Usage view

Paste the block below to the **mbi-atlas** agent. Atlas is a web UI, so unlike the terminal coach it *can*
show the real logo and brand colors.

---

## PROMPT (copy from here)

Brand the **Harness AI Usage** view (and the Atlas header generally) with the Mindbowser identity. Atlas
currently has **no logo asset in `public/`** — add one and use it.

### 1. Add the logo asset
- Add the Mindbowser mark to `public/` (e.g. `public/mindbowser-mark.png` — the teal zigzag favicon, 128×128
  or an SVG if available). If you don't have the file, ask for it; do not invent a logo.
- Also wire it as the page **favicon** (`<link rel="icon" href="…">`) if not already set.

### 2. Use it in the header
- Put the mark next to the page/tab title so the **"Harness AI Usage"** view reads as a first-class
  Mindbowser product — small logo (~20–24px) + the title, not a giant banner.
- Where the UI says just "Harness", prefer **"MB Harness"** / "Mindbowser Health Harness" for consistency
  with the rest of the tooling.

### 3. Brand colors (approximate — match the official palette if you have it)
- **Teal** ≈ `#34B3A9` (the mark) — use as the primary accent for the harness view (KPI highlights, the
  active-tab indicator, healthy/🟢 states).
- **Purple** ≈ `#5E2A8C` (the wordmark) — secondary accent / headings.
- Keep the existing neutral card/table styling; just swap the accent to teal so the harness view feels on-brand
  rather than generic. Don't restyle the whole Atlas app — scope it to the harness view + the shared header logo.

### 4. Keep it tasteful
- Logo small and crisp; don't tint data or hurt contrast/readability (healthcare users, accessibility).
- This is polish on top of the working dashboard (5 KPIs + per-dev health table + the Hygiene strip from
  `docs/atlas-hygiene-panel-brief.md`) — don't change the data, just the chrome.

### Acceptance
- The Mindbowser mark shows in the header + as favicon; the harness view uses the teal accent; "MB Harness"
  wording is consistent; nothing about the data/layout regresses; contrast/a11y intact.

## END PROMPT

# Fleet script

Org-wide rollout of the health-harness plugin via Claude Code **managed settings**, pushed by IT through
Fleet. **One script. No variables. Just run it.**

## The whole thing: two files, nothing to configure

| File | Runs on |
|---|---|
| `mb_harness.sh` | macOS + Linux/Ubuntu/WSL |
| `mb_harness.ps1` | Windows |

Two files only because shell and PowerShell can't share one (a Fleet constraint). **Fleet auto-routes by
OS**, so the admin never picks the OS — and there are **no env vars or arguments** to set. Upload both,
click run.

## What it does (every run)

1. **Enables the plugin org-wide + turns on auto-update** (writes `managed-settings.json`).
2. **Force-refreshes the catalog** so the latest version is found now.

It's **idempotent**, so the **same script is your install *and* your "push an update"** — a re-run just
refreshes the catalog again. Run it for the initial rollout, and re-run it (or wire it as a self-healing
Fleet **policy**) whenever you want to push the latest. Users **restart Claude Code** to apply.

## IT handover — the whole job

1. **Roll out / push an update:** run the script (no config). Done.
2. **Users get it:** on their next Claude Code **restart** (auto-update). A dev who wants it immediately runs
   **`/harness-update`** — *not* `claude plugin update` (that fails on managed scope).
3. ⚠️ **Landmine:** the marketplace repo is **public**, so this works tokenless. **If it's ever made
   private, managed auto-update silently stops fleet-wide** unless you deploy a read-only `GITHUB_TOKEN`.

## Notes

- **The refresh half runs as the logged-in user** (the marketplace cache is per-user). The `.sh` re-execs as
  the console user if Fleet runs it as root; on Windows, configure the Fleet script to run **as the current
  user**. If `claude` isn't on that PATH the refresh **soft-skips** (prints a NOTE) and **auto-update still
  catches up on restart** — the script never hard-fails.
- **Reverting to user-owned** (rare) isn't part of this script — it's just removing the managed-settings
  file (`rm "<path>/managed-settings.json"`). Paths are in `TESTING.md` / `../rollout.md`.

See **`TESTING.md`** for the IT pilot checklist, and `../rollout.md` for the full model + troubleshooting.

# Fleet script

Org-wide rollout of the health-harness plugin via Claude Code **managed settings**, pushed by IT through
Fleet. **One script, one decision.**

## The whole thing: two files, one action variable

| File | Runs on | You don't pick this — Fleet does |
|---|---|---|
| `mb_harness.sh` | macOS + Linux/Ubuntu/WSL | Fleet auto-runs it on those hosts |
| `mb_harness.ps1` | Windows | Fleet auto-runs it on Windows |

There are two files only because shell and PowerShell can't be the same file. **Fleet auto-routes by OS**,
so the admin never picks the OS. The **only** decision is the action — set `MB_HARNESS_ACTION`:

| `MB_HARNESS_ACTION` | What it does |
|---|---|
| `manage` *(default)* | install + enable the plugin + turn on **auto-update** (writes managed-settings.json) |
| `unmanage` | remove the managed lock → machine becomes **user-owned** (removes managed-settings.json) |
| `refresh` | force a **catalog refresh** when auto-update misses the new version (restart applies) |

## How to run it

1. Upload **both** files to Fleet as one script target (Fleet runs the right one per OS).
2. Set **`MB_HARNESS_ACTION`** to `manage` / `unmanage` / `refresh` (env var in Fleet, or edit the default
   at the top of the script). Default is `manage`.
3. Run across the fleet.

That's it — no per-OS, no per-action file hunting.

## What each action means in practice

- **`manage`** (the normal rollout): run **once** (or as a self-healing policy — it's idempotent). It
  enables the plugin and turns on auto-update. From then on, **Claude Code auto-updates each user on
  restart** — IT never pushes versions. A dev who wants the latest *now* runs **`/harness-update`** (not
  `claude plugin update`, which fails on managed scope).
- **`unmanage`**: releases the lock so devs own the plugin themselves
  (`claude plugin install|update|uninstall health-harness@mindbowser`, default scope `user`).
- **`refresh`**: for when auto-update's best-effort startup refresh keeps missing the new version. Runs the
  explicit `claude plugin marketplace update`. **Pre-stages only — users still restart to apply.** The
  marketplace cache is **per-user**, so `refresh` must run **as the logged-in user** (the `.sh` re-execs as
  the console user if Fleet runs it as root; on Windows configure the Fleet script to run as the current
  user). If `claude` isn't on PATH it no-ops — the dev's **`/harness-update`** is the fallback.

## IT handover — the whole job

1. **Roll out:** run with `MB_HARNESS_ACTION=manage` (default). Done — updates flow automatically on restart.
2. **A dev needs latest now:** they run **`/harness-update`**.
3. **Catalog keeps missing a version:** run with `MB_HARNESS_ACTION=refresh`, users restart.
4. **Revert to user-owned:** run with `MB_HARNESS_ACTION=unmanage`.
5. ⚠️ **Landmine:** the marketplace repo is **public**, so this works tokenless. **If it's ever made
   private, managed auto-update silently stops fleet-wide** unless you deploy a read-only `GITHUB_TOKEN`.
   For an urgent push you can also add `"forceRemoteSettingsRefresh": true` to managed-settings.

See `../rollout.md` for the full model, paths, precedence, and troubleshooting.

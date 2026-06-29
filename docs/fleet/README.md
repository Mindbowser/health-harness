# Fleet scripts

Org-wide rollout of the health-harness plugin via Claude Code **managed settings**, pushed by IT through
Fleet. The org model is **Fleet-managed + track-latest**: deploy once, and every machine auto-updates to
the latest release on restart. Un-manage scripts revert a machine to user-owned.

## Scripts

| Script | Hosts | What it does |
|---|---|---|
| `mb_harness_macos.sh` | macOS | **Manage**: write managed-settings.json → `/Library/Application Support/ClaudeCode/` |
| `mb_harness_ubuntu.sh` | Ubuntu / Linux / WSL | **Manage**: write managed-settings.json → `/etc/claude-code/` |
| `mb_harness_windows.ps1` | Windows | **Manage**: write managed-settings.json → `C:\Program Files\ClaudeCode\` |
| `mb_harness_macos_unmanage.sh` | macOS | **Un-manage**: remove that managed-settings.json → machine becomes user-owned |
| `mb_harness_ubuntu_unmanage.sh` | Ubuntu / Linux / WSL | **Un-manage**: remove that managed-settings.json → machine becomes user-owned |
| `mb_harness_windows_unmanage.ps1` | Windows | **Un-manage**: remove that managed-settings.json → machine becomes user-owned |

## How updates work (important)

The manage script does **not** perform updates — it writes managed-settings with `"autoUpdate": true`,
which **turns auto-update on, once**. The actual updating is done by **Claude Code itself at each user's
restart**: it reads the marketplace, sees a newer version, and pulls it. The marketplace always serves the
latest release. So **IT never pushes versions** — new releases flow to everyone automatically on restart.

Auto-update at startup is **best-effort** (async fetch; a slow network can make it land on a *later*
restart). If a dev needs the latest **immediately**, they run **`/harness-update`** — **not**
`claude plugin update` (that fails on managed scope, which is read-only).

## IT admin handover — the whole job

1. **Deploy once:** run `mb_harness_<os>` across the fleet (or attach as a self-healing Fleet **policy** —
   the scripts are idempotent). This enables the plugin + auto-update org-wide.
2. **Updates flow automatically** — each user gets the latest on their next Claude Code restart. **No
   per-release action by IT.**
3. **Dev needs the latest now:** they run **`/harness-update`** (not `claude plugin update`).
4. **Revert a machine/fleet to user-owned:** run `mb_harness_<os>_unmanage`.
5. ⚠️ **Landmine:** the marketplace repo is **public**, so this works tokenless. **If it is ever made
   private, managed auto-update silently stops fleet-wide** unless you deploy a read-only `GITHUB_TOKEN`
   (Fleet secret → managed-settings `env` or a system env var).

## Deploy notes

- Fleet auto-detects each host's OS and runs the matching script type (shell vs PowerShell).
- Scripts are **idempotent** and **version-agnostic** (`autoUpdate` converges every host to latest), so
  they double as **policy remediations** for self-healing — new/drifted hosts get corrected automatically.

## Reverting to user-owned (optional)

Push the `mb_harness_<os>_unmanage` script to release the managed lock. After it runs, a dev owns the
plugin themselves with plain commands (default scope is `user`):

```
install  →  claude plugin install   health-harness@mindbowser
update   →  /harness-update
remove   →  claude plugin uninstall health-harness@mindbowser
```

Note: removing the lock removes the managed-scope enablement. A dev whose user-scope settings already
enable the plugin keeps it; one who relied solely on the lock should run the install command (then restart).

See `../rollout.md` for the full model, paths, precedence, and troubleshooting.

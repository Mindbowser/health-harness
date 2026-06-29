---
name: harness-update
description: Update the Mindbowser Health Harness plugin to the latest version in one step (no marketplace UI).
disable-model-invocation: true
---

Update the plugin without navigating the marketplace settings. Run this when you want the latest now.
(The hands-off alternative is **auto-update** — `/plugin` → Marketplaces → `mindbowser` → enable
auto-update, or org-wide via managed settings; see `docs/rollout.md`. Then you never run this.)

> **Keep the source private.** Do NOT surface the marketplace source or repo path in anything you show the
> user (no `Mindbowser/health-harness`, no `github:…` row, no marketplace-name table). The user-facing
> result is only: *Health Harness `<old> → <new>`, scope, status, and the reload step.* Run the CLI
> commands as needed, but don't echo their source/repo output into your summary.

## Process

0. **First: is this a managed / auto-update install?** If the plugin is enabled via **managed settings**
   (MDM/Fleet rollout) or `enabledPlugins` + a marketplace with `autoUpdate: true` (or `FORCE_AUTOUPDATE_PLUGINS=1`),
   there is **no manual user-scope install** — so `claude plugin uninstall/update --scope …` fails with
   *"not installed at scope user"*. For these, the update is **automatic on restart**: run
   `claude plugin marketplace update mindbowser` (refresh the catalog), then tell the user to **fully restart
   Claude Code** — auto-update reinstalls the latest. Do NOT run uninstall/install --scope. (Signal that you're
   in this case: the user already has managed-settings, or step 2's commands return "not installed at scope".)
1. **Check current state.** Run `claude plugin list` (note the installed version + **scope**:
   project / user / local). Only if the routine update later reports the source is a **local path** (not a
   GitHub marketplace), switch it to GitHub first (local marketplaces don't update) — handle that quietly,
   without printing the repo path to the user.
1b. **Check the AVAILABLE version via the version API (the authoritative latest-released source).** Unlike
   `claude plugin list` (installed only), this tells you the real latest. Derive the endpoint from the
   telemetry endpoint (`…/usage` → `…/latest`):
   `curl -s --max-time 8 "$(printf '%s' "${HARNESS_TELEMETRY_ENDPOINT:-https://mbi.mindbowser.com/atlas/api/harness/usage}" | sed 's#/usage#/latest#')"`
   → `{"version":"X"}`. If it resolves, report **installed vs available** for real (e.g. `0.2.25 → 0.2.27
   available`). **FAIL-OPEN:** if it's unreachable or `null`, proceed silently — this is informational and
   must NEVER gate or skip the reinstall (the API can lag a release too).
2. **ALWAYS refresh + reinstall — never skip because it "looks current."** `claude plugin list` shows the
   **installed** version, not the **available** one, and the catalog (and your own context) can lag a release
   — so you cannot conclude "already latest" from it. Reinstall is idempotent and cheap; always run all three:
   ```bash
   claude plugin marketplace update mindbowser
   claude plugin uninstall health-harness@mindbowser --scope <scope>
   claude plugin install   health-harness@mindbowser --scope <scope>
   ```
   Use the **scope from step 1** (default `user`). (If you want to *verify* there was a newer version, compare
   the post-reinstall `plugin list` version to the pre — don't gate the reinstall on a guess beforehand.)
   **If any command returns "not installed at scope …", you're in the managed/auto-update case (step 0)** —
   stop, run only `claude plugin marketplace update mindbowser`, and have the user restart Claude Code.
3. **Apply + confirm.** Run `/reload-plugins` (or tell the user to **fully restart** Claude Code — hook
   and MCP changes need a restart). Then `claude plugin list` and report **old → new version** only.
   **Cross-check against the version API:** if the new installed version equals `/latest` from step 1b,
   confirm *"✓ on the latest (`X`)"*; if they differ, flag the lag (*"installed `X`, server latest `Y` — the
   catalog may be a beat behind"*). Report **version numbers only** — never the source/repo path.

## Anti-patterns

- ❌ Surfacing the marketplace source / repo path (`Mindbowser/health-harness`) in the summary — keep it
  internal; report only the product name + version.
- ❌ Running only `marketplace update` and reporting "updated" — that refreshes the catalog, not the
  installed plugin. Always reinstall (or restart with auto-update on).
- ❌ **Concluding "already on the latest" and skipping the reinstall** — `plugin list` is the *installed*
  version, not the available one, and the catalog/your context can be stale (this is exactly how a `.89`
  machine reported "already latest" when `.94` was out). Always reinstall; confirm from the *after* version.
- ❌ Leaving a local-path marketplace in place — it will never pull new versions.

## Completion criteria

- [ ] Refreshed + plugin reinstalled at the correct scope (source switched to GitHub silently if it was local).
- [ ] `/reload-plugins` run (or restart advised); the new version is confirmed and reported as `<old> → <new>` only.

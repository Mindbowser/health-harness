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

1. **Check current state.** Run `claude plugin list` (note the installed version + **scope**:
   project / user / local). Only if the routine update later reports the source is a **local path** (not a
   GitHub marketplace), switch it to GitHub first (local marketplaces don't update) — handle that quietly,
   without printing the repo path to the user.
2. **Refresh + reinstall** (a bare `marketplace update` only refreshes the catalog — reinstall applies it):
   ```bash
   claude plugin marketplace update mindbowser
   claude plugin uninstall health-harness@mindbowser --scope <scope>
   claude plugin install   health-harness@mindbowser --scope <scope>
   ```
   Use the **scope from step 1** (default `user`).
3. **Apply + confirm.** Run `/reload-plugins` (or tell the user to **fully restart** Claude Code — hook
   and MCP changes need a restart). Then `claude plugin list` and report **old → new version** only.

## Anti-patterns

- ❌ Surfacing the marketplace source / repo path (`Mindbowser/health-harness`) in the summary — keep it
  internal; report only the product name + version.
- ❌ Running only `marketplace update` and reporting "updated" — that refreshes the catalog, not the
  installed plugin. Always reinstall (or restart with auto-update on).
- ❌ Leaving a local-path marketplace in place — it will never pull new versions.

## Completion criteria

- [ ] Refreshed + plugin reinstalled at the correct scope (source switched to GitHub silently if it was local).
- [ ] `/reload-plugins` run (or restart advised); the new version is confirmed and reported as `<old> → <new>` only.

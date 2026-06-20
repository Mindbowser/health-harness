---
name: harness-update
description: Update the Mindbowser Health Harness plugin to the latest version in one step (no marketplace UI).
disable-model-invocation: true
---

Update the plugin without navigating the marketplace settings. Run this when you want the latest now.
(The hands-off alternative is **auto-update** — `/plugin` → Marketplaces → `mindbowser` → enable
auto-update, or org-wide via managed settings; see `docs/rollout.md`. Then you never run this.)

## Process

1. **Check current state.** Run `claude plugin list` (note the installed version + **scope**:
   project / user / local) and `claude plugin marketplace list` (note the `mindbowser` source).
   - If the source is a **local path** (not `github: Mindbowser/health-harness`), switch to GitHub first —
     local marketplaces don't update: `claude plugin marketplace remove mindbowser` then
     `claude plugin marketplace add Mindbowser/health-harness --scope <scope>`.
2. **Refresh + reinstall** (a bare `marketplace update` only refreshes the catalog — reinstall applies it):
   ```bash
   claude plugin marketplace update mindbowser
   claude plugin uninstall health-harness@mindbowser --scope <scope>
   claude plugin install   health-harness@mindbowser --scope <scope>
   ```
   Use the **scope from step 1** (default `project`).
3. **Apply + confirm.** Run `/reload-plugins` (or tell the user to **fully restart** Claude Code — hook
   and MCP changes need a restart). Then `claude plugin list` and report **old → new version**.

## Anti-patterns

- ❌ Running only `marketplace update` and reporting "updated" — that refreshes the catalog, not the
  installed plugin. Always reinstall (or restart with auto-update on).
- ❌ Leaving a local-path marketplace in place — it will never pull new versions.

## Completion criteria

- [ ] Marketplace source confirmed as GitHub; refreshed + plugin reinstalled at the correct scope.
- [ ] `/reload-plugins` run (or restart advised); the new version is confirmed via `claude plugin list`.

# Rollout & updates (org)

How to get the harness onto everyone's machine and keep it current. (Verified against Claude Code's
plugin docs — see links at the bottom.)

## First rule: use the **GitHub** marketplace, not a local path

Only **GitHub** marketplaces support **auto-update**; a local-path marketplace never auto-updates and must
be hand-synced (that's why a local install can get stuck on an old version). For anything beyond solo dev:

```bash
claude plugin marketplace add Mindbowser/health-harness --scope project
```

## Pick an install path by scope

| Scope | For | How | Updates |
|---|---|---|---|
| **Personal trial** | one dev | install with `--scope local` (writes gitignored `settings.local.json`) | manual, or per-user auto-update |
| **Per-repo (shared)** | a team on one repo | commit `.claude/settings.json` (marketplace + `enabledPlugins`, project scope) | teammate trusts repo → marketplace added → **installs once**; then auto-update if enabled |
| **Org-wide (recommended)** | everyone | **managed settings via MDM** | auto-registers + auto-enables + **auto-updates**; users can't drift off it |

## Org-wide: managed settings (the easy button)

Deploy this `managed-settings.json` via your MDM. It **registers the marketplace, enables the plugin, and
auto-updates it at every startup** — for everyone, no per-person steps, and users can't disable it
(managed settings are the highest-precedence layer). This is the real answer to "everyone, easily."

```json
{
  "extraKnownMarketplaces": {
    "mindbowser": {
      "source": { "source": "github", "repo": "Mindbowser/health-harness" },
      "autoUpdate": true
    }
  },
  "enabledPlugins": { "health-harness@mindbowser": true }
}
```

(Copy in `docs/managed-settings.example.json`.) Deploy to:

| OS | Path |
|---|---|
| macOS | `/Library/Application Support/ClaudeCode/managed-settings.json` |
| Linux / WSL | `/etc/claude-code/managed-settings.json` |
| Windows | `C:\Program Files\ClaudeCode\managed-settings.json` (or `HKLM\SOFTWARE\Policies\ClaudeCode`) |

Precedence (high→low): **managed** → CLI args → `settings.local.json` → project `settings.json` → user `~/.claude/settings.json`.

## Per-repo (no MDM)

Commit `.claude/settings.json` with the **same two blocks** at project scope. On clone, a teammate is
prompted to **trust the repo** → the marketplace is added → they **install once**
(`claude plugin install health-harness@mindbowser --scope project`, or the `/plugin` Discover tab). Note:
committing project settings does **not** auto-install plugins — only managed settings do that.

**Make auto-update the default for everyone — no per-person toggle.** Put `"autoUpdate": true` on the
`mindbowser` entry in the **committed** `.claude/settings.json` (the author can't force it from the
published marketplace; it lives in consumer settings, but a committed project setting *is* shared):
```json
{
  "extraKnownMarketplaces": {
    "mindbowser": { "source": { "source": "github", "repo": "Mindbowser/health-harness" }, "autoUpdate": true }
  },
  "enabledPlugins": { "health-harness@mindbowser": true }
}
```
Then nobody touches the `/plugin` toggle — once installed, it auto-updates at startup. (The per-person
toggle `/plugin` → Marketplaces → `mindbowser` → enable auto-update is the manual alternative.)
For org-wide *enforced* auto-update that also auto-installs, use **managed settings** (above).

## Updates — how they show up / apply

- **Auto-update (recommended):** at **startup**, Claude Code refreshes the marketplace, updates plugins
  from it, and notifies in-session: *"Updates available… Run `/reload-plugins`."* Enable org-wide
  (managed settings above) or per-user (the `/plugin` toggle).
- **Manual (one person):**
  ```bash
  claude plugin marketplace update mindbowser
  claude plugin uninstall health-harness@mindbowser --scope project
  claude plugin install   health-harness@mindbowser --scope project
  ```
  Prefer **reinstall** over `claude plugin update` — that command is unreliable/undocumented (often
  "Plugin not found" despite being installed).
- **Env toggles:** `DISABLE_AUTOUPDATER=1` disables all auto-updates; add `FORCE_AUTOUPDATE_PLUGINS=1` to
  keep *plugin* auto-update while pausing Claude Code's own self-update.

## Releasing a new version (maintainers)

Bump `version` in `.claude-plugin/plugin.json`, `.claude-plugin/marketplace.json`, and `package.json`,
then merge to `main`. The GitHub marketplace serves `main`, so auto-update picks it up on the next
startup. (Optional: tag `health-harness--v<version>` if you want pinned/stable releases instead of
latest-on-main.)

---

Docs: [discover-plugins](https://code.claude.com/docs/en/discover-plugins.md) ·
[settings](https://code.claude.com/docs/en/settings.md) ·
[setup (auto-updates)](https://code.claude.com/docs/en/setup.md)

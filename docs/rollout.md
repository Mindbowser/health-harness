# Rollout & updates (org)

How to get the harness onto everyone's machine and keep it current. (Verified against Claude Code's
plugin docs — see links at the bottom.)

## Editors & agents — where the harness runs

The harness is a **Claude Code plugin**, so it runs wherever **Claude Code** runs — **the editor is just
the window, Claude Code is the agent.** Same flow, same quality, everywhere it's Claude Code:

| Developer's editor | How to get the full harness | Native agent? |
|---|---|---|
| **VS Code** | The **Claude Code VS Code extension** (it *is* Claude Code) — or run `claude` in the integrated terminal. | — |
| **Cursor** | Run the **`claude` CLI in Cursor's integrated terminal**. Full skills + wall + sounds + auto-update. | ❌ Cursor's own Composer/agent won't load Claude Code plugins. |
| **Antigravity** (or any IDE w/ a terminal) | Same — run **`claude` in its terminal**. | ❌ its native (Gemini) agent won't load the plugin. |
| **Terminal / SSH** | `claude` directly. | — |

**The rule for the team:** pick any editor you like, but **use Claude Code as the agent** (its VS Code
extension, or `claude` in the editor's terminal). The harness travels with Claude Code, identically.

**What does NOT work:** the **native agents** of Cursor (Composer) or Antigravity are *different agents* —
they don't read Claude Code's `SKILL.md`, `hooks.json`, marketplace, or settings, so the harness's
**skills, the wall, redaction scanner, sounds, and auto-update won't load there.** The *discipline*
(Build Loop, vertical slices, TDD, governance) is portable and could be re-expressed as Cursor rules, but
you'd lose the **enforcement** (the deterministic wall + gates) — so for consistent quality, standardize
on Claude Code as the agent rather than reimplementing per tool.

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

### Deploy it with FleetDM (our MDM)

[FleetDM](https://fleetdm.com) (open-source) can drop the file on every host. Simplest cross-platform
route: a **Fleet script per OS** that writes `managed-settings.json` to the path above — run it across
hosts, or attach it to a **policy** so drift self-heals.

**macOS / Linux** (Fleet shell script — set `DIR` per OS):
```bash
#!/bin/sh
set -e
DIR="/Library/Application Support/ClaudeCode"   # Linux: /etc/claude-code
mkdir -p "$DIR"
cat > "$DIR/managed-settings.json" <<'JSON'
{
  "extraKnownMarketplaces": {
    "mindbowser": { "source": { "source": "github", "repo": "Mindbowser/health-harness" }, "autoUpdate": true }
  },
  "enabledPlugins": { "health-harness@mindbowser": true }
}
JSON
```
**Windows** (Fleet PowerShell script):
```powershell
$dir = "C:\Program Files\ClaudeCode"; New-Item -ItemType Directory -Force -Path $dir | Out-Null
@'
{ "extraKnownMarketplaces": { "mindbowser": { "source": { "source": "github", "repo": "Mindbowser/health-harness" }, "autoUpdate": true } }, "enabledPlugins": { "health-harness@mindbowser": true } }
'@ | Set-Content -Path "$dir\managed-settings.json" -Encoding UTF8
```
- **Self-healing (recommended):** add a Fleet **policy** that checks the file exists/matches and wire the
  script as its remediation, so any host that drifts gets re-corrected automatically.
- **macOS alternative:** deliver an Apple **configuration profile** for the `com.anthropic.claudecode`
  managed-preferences domain instead of the file — but the file-script route is uniform across all OSes.

## Per-repo (no MDM)

Commit `.claude/settings.json` with the **same two blocks** at project scope. On clone, a teammate is
prompted to **trust the repo** → the marketplace is added → they **install once**
(`claude plugin install health-harness@mindbowser --scope project`, or the `/plugin` Discover tab). Note:
committing project settings does **not** auto-install plugins — only managed settings do that.

**Turning auto-update on (per the docs):**
- **Per user:** `/plugin` → **Marketplaces** → `mindbowser` → **enable auto-update**. (Third-party
  marketplaces are **off by default**; only the official Anthropic marketplace is on by default.)
- **For everyone with no per-user action:** set `"autoUpdate": true` on the `extraKnownMarketplaces` entry
  in **managed settings** (admin/MDM — see the org-wide section above). Per Claude Code's docs this is the
  **only** way to default it on without each person toggling.

There is **no install-time flag** and **no marketplace-author field** to default auto-update on — a
third-party plugin can't force it onto its users by design. So the realistic "set once for the whole org"
answer is **managed settings**; otherwise it's the per-user toggle.

## Updates — how they show up / apply

- **Auto-update (recommended):** at **startup**, Claude Code refreshes the marketplace, updates plugins
  from it, and notifies in-session: *"Updates available… Run `/reload-plugins`."* Enable org-wide
  (managed settings above) or per-user (the `/plugin` toggle).
- **Manual — easiest:** in Claude Code run **`/plugin marketplace update`** (the in-app slash command). It
  refreshes **and applies** in one step. ⚠️ The **shell** `claude plugin marketplace update mindbowser`
  only refreshes the *catalog* — it does **not** change the installed plugin, so `plugin list` still shows
  the old version until you reinstall/restart.
- **Manual — shell (full apply):**
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

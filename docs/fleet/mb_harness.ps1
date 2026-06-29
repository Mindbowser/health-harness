# Mindbowser Health Harness — Fleet rollout for Windows. JUST RUN IT — no variables.
# (macOS/Linux: mb_harness.sh. Fleet auto-runs the .ps1 on Windows and the shell one elsewhere.)
#
# Does both halves of a rollout/update in one shot, idempotently — the SAME script is your install AND your
# "push an update" (a re-run just refreshes the catalog again):
#   1) enables the plugin + auto-update   (writes managed-settings.json)
#   2) force-refreshes the catalog        (re-run = push an update)
# Users then RESTART Claude Code to apply. Safe to run repeatedly / as a self-healing policy.
$ErrorActionPreference = "Stop"

$dir = "C:\Program Files\ClaudeCode"
$f   = "$dir\managed-settings.json"

# 1) enable + auto-update (idempotent)
New-Item -ItemType Directory -Force -Path $dir | Out-Null
@'
{ "extraKnownMarketplaces": { "mindbowser": { "source": { "source": "github", "repo": "Mindbowser/health-harness" }, "autoUpdate": true } }, "enabledPlugins": { "health-harness@mindbowser": true } }
'@ | Set-Content -Path $f -Encoding UTF8
Write-Output "OK: managed-settings written ($f) - plugin enabled + auto-update on."

# 2) force a catalog refresh so the latest is found now. The marketplace cache is PER-USER, so run this Fleet
#    script as the logged-in user (not SYSTEM). If claude isn't on PATH it's a SOFT note - auto-update still
#    catches up on restart.
if (Get-Command claude -ErrorAction SilentlyContinue) {
  claude plugin marketplace update mindbowser | Out-Null
  Write-Output "OK: catalog refreshed - newest version staged."
} else {
  Write-Output "NOTE: catalog refresh skipped (claude not on PATH; run as the logged-in user) - auto-update still catches up on restart."
}

Write-Output "Done. Ask users to fully restart Claude Code to pick up the latest."

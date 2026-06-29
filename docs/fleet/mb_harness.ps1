# Mindbowser Health Harness — ONE Fleet script for Windows.
# (macOS/Linux use mb_harness.sh — two interpreters can't share a file; that's a Fleet constraint.
#  Fleet auto-runs the .ps1 on Windows and the shell one elsewhere, so you never pick the OS.)
#
# Pick the action — the ONLY decision: set MB_HARNESS_ACTION in Fleet, or pass -Action, or edit the default.
#   manage    (default)  install + enable the plugin + turn on auto-update   [writes managed-settings.json]
#   unmanage             remove the managed lock -> machine becomes user-owned [removes managed-settings.json]
#   refresh              force a catalog refresh when auto-update misses the new version (restart applies)
param([string]$Action = $env:MB_HARNESS_ACTION)
if (-not $Action) { $Action = "manage" }
$ErrorActionPreference = "Stop"

$dir = "C:\Program Files\ClaudeCode"
$f   = "$dir\managed-settings.json"

switch ($Action) {
  "manage" {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    @'
{ "extraKnownMarketplaces": { "mindbowser": { "source": { "source": "github", "repo": "Mindbowser/health-harness" }, "autoUpdate": true } }, "enabledPlugins": { "health-harness@mindbowser": true } }
'@ | Set-Content -Path $f -Encoding UTF8
    Write-Output "OK [manage]: wrote $f - plugin enabled + auto-update on. Users restart to get the latest."
  }
  "unmanage" {
    if (Test-Path $f) { Remove-Item -Force $f; Write-Output "OK [unmanage]: removed $f - this machine is now user-owned." }
    else { Write-Output "OK [unmanage]: no managed lock present - already user-owned." }
    Write-Output "Next (per user): claude plugin install health-harness@mindbowser   # then restart Claude Code"
  }
  "refresh" {
    # marketplace cache is PER-USER — run this Fleet script as the logged-in user, not SYSTEM
    if (Get-Command claude -ErrorAction SilentlyContinue) {
      claude plugin marketplace update mindbowser
      Write-Output "OK [refresh]: catalog refreshed. Restart Claude Code (or /reload-plugins) to apply."
    } else {
      Write-Output "SKIP: claude not on PATH - run as the logged-in user, or the dev runs /harness-update."
    }
  }
  default { Write-Output "unknown MB_HARNESS_ACTION: '$Action' (use manage | unmanage | refresh)"; exit 1 }
}

# Fleet script — Windows (PowerShell). FORCE catalog refresh: explicitly pull the latest marketplace data so
# Claude Code reliably finds the new version. Use this when auto-update's startup refresh is best-effort and
# sometimes MISSES the new version. PRE-STAGES only — the user must RESTART (or /reload-plugins) to apply.
# Does NOT bypass managed scope (it's just a marketplace refresh, allowed at any scope).
#
# IMPORTANT: the plugin/marketplace cache is PER-USER. Run this in the LOGGED-IN USER's context (configure
# the Fleet script to run as the current user, not SYSTEM). If `claude` isn't on PATH, it no-ops with a note.
$ErrorActionPreference = "Stop"

if (Get-Command claude -ErrorAction SilentlyContinue) {
  claude plugin marketplace update mindbowser
  Write-Output "OK: catalog refreshed. Restart Claude Code (or /reload-plugins) to apply the latest."
} else {
  Write-Output "SKIP: 'claude' not on PATH (run as the logged-in user). Dev can run /harness-update instead."
}

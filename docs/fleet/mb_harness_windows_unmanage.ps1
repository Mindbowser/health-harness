# Fleet script — Windows (PowerShell). UN-MANAGE the harness: remove the org-deployed Claude Code
# managed-settings.json so the plugin is no longer locked at managed scope. After this runs, the machine
# is USER-OWNED — each dev installs / updates / removes the harness themselves at user scope.
#
# Assumes managed-settings.json is harness-only (that's what mb_harness_windows.ps1 wrote). If your org
# later puts OTHER managed policy in this file, edit out just the harness keys instead of deleting it.
# Idempotent: safe to run repeatedly (no-op if already gone).
$ErrorActionPreference = "Stop"

$f = "C:\Program Files\ClaudeCode\managed-settings.json"
if (Test-Path $f) {
  Remove-Item -Force $f
  Write-Output "OK: removed managed lock ($f). This machine is now user-owned."
} else {
  Write-Output "OK: no managed lock present ($f) - already user-owned."
}
Write-Output "Next (per user): claude plugin install health-harness@mindbowser  # then restart Claude Code"

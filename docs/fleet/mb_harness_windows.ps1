# Fleet script — Windows (PowerShell). Writes Claude Code managed-settings.json so the
# health-harness plugin is registered, enabled, and auto-updates for everyone.
# Idempotent: safe to run repeatedly and as a policy remediation.
# Version-agnostic: autoUpdate converges every host to latest on its own.
$ErrorActionPreference = "Stop"

$dir = "C:\Program Files\ClaudeCode"
New-Item -ItemType Directory -Force -Path $dir | Out-Null
@'
{
  "extraKnownMarketplaces": {
    "mindbowser": { "source": { "source": "github", "repo": "Mindbowser/health-harness" }, "autoUpdate": true }
  },
  "enabledPlugins": { "health-harness@mindbowser": true }
}
'@ | Set-Content -Path "$dir\managed-settings.json" -Encoding UTF8

# Optional: force an immediate update instead of waiting for startup pickup.
# claude plugin update health-harness@mindbowser

Write-Output "managed-settings.json written to $dir"

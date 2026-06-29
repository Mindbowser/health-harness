#!/bin/sh
# Fleet script — macOS. Writes Claude Code managed-settings.json so the
# health-harness plugin is registered, enabled, and auto-updates for everyone.
# Idempotent: safe to run repeatedly and as a policy remediation.
# Version-agnostic: autoUpdate converges every host to latest on its own.
set -e

DIR="/Library/Application Support/ClaudeCode"
mkdir -p "$DIR"
cat > "$DIR/managed-settings.json" <<'JSON'
{
  "extraKnownMarketplaces": {
    "mindbowser": { "source": { "source": "github", "repo": "Mindbowser/health-harness" }, "autoUpdate": true }
  },
  "enabledPlugins": { "health-harness@mindbowser": true }
}
JSON

# Optional: force an immediate update instead of waiting for startup pickup.
# command -v claude >/dev/null 2>&1 && claude plugin update health-harness@mindbowser || true

echo "managed-settings.json written to $DIR"

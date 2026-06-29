#!/bin/sh
# Mindbowser Health Harness — Fleet rollout for macOS + Linux/Ubuntu/WSL. JUST RUN IT — no variables.
# (Windows: mb_harness.ps1. Fleet auto-runs the shell one on macOS/Linux and the .ps1 on Windows.)
#
# Does both halves of a rollout/update in one shot, idempotently — so the SAME script is your install
# AND your "push an update" (a re-run just refreshes the catalog again):
#   1) enables the plugin org-wide + turns on auto-update   (writes managed-settings.json)
#   2) force-refreshes the catalog so the latest is found   (re-run = push an update)
# Users then RESTART Claude Code to apply. Safe to run repeatedly / as a self-healing Fleet policy.
set -e

case "$(uname -s)" in
  Darwin) DIR="/Library/Application Support/ClaudeCode"; U="$(stat -f%Su /dev/console 2>/dev/null)" ;;
  Linux)  DIR="/etc/claude-code"; U="${SUDO_USER:-$(logname 2>/dev/null || who 2>/dev/null | awk 'NR==1{print $1}')}" ;;
  *) echo "unsupported OS: $(uname -s)"; exit 1 ;;
esac

# 1) enable + auto-update (idempotent)
mkdir -p "$DIR"
cat > "$DIR/managed-settings.json" <<'JSON'
{
  "extraKnownMarketplaces": {
    "mindbowser": { "source": { "source": "github", "repo": "Mindbowser/health-harness" }, "autoUpdate": true }
  },
  "enabledPlugins": { "health-harness@mindbowser": true }
}
JSON
echo "OK: managed-settings written ($DIR) — plugin enabled + auto-update on."

# 2) force a catalog refresh so the latest is found now. The marketplace cache is PER-USER, so run it as the
#    logged-in user. If claude isn't on that PATH it's a SOFT note — auto-update still catches up on restart.
REFRESH='command -v claude >/dev/null 2>&1 && claude plugin marketplace update mindbowser >/dev/null 2>&1 \
  && echo "OK: catalog refreshed — newest version staged." \
  || echo "NOTE: catalog refresh skipped (claude not on this user PATH) — auto-update still catches up on restart."'
if [ "$(id -u)" -eq 0 ] && [ -n "$U" ] && [ "$U" != "root" ]; then
  sudo -u "$U" -H sh -lc "$REFRESH"
else
  sh -lc "$REFRESH"
fi

echo "Done. Ask users to fully restart Claude Code to pick up the latest."

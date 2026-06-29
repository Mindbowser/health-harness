#!/bin/sh
# Mindbowser Health Harness — ONE Fleet script for macOS + Linux/Ubuntu/WSL.
# (Windows uses mb_harness.ps1 — two interpreters can't share a file; that's a Fleet constraint.
#  Fleet auto-runs the shell one on macOS/Linux and the .ps1 on Windows, so you never pick the OS.)
#
# Pick the action — the ONLY decision: set MB_HARNESS_ACTION in Fleet, or edit the default below.
#   manage    (default)  install + enable the plugin + turn on auto-update   [writes managed-settings.json]
#   unmanage             remove the managed lock → machine becomes user-owned [removes managed-settings.json]
#   refresh              force a catalog refresh when auto-update misses the new version (restart applies)
set -e
ACTION="${MB_HARNESS_ACTION:-manage}"

case "$(uname -s)" in
  Darwin) DIR="/Library/Application Support/ClaudeCode" ;;
  Linux)  DIR="/etc/claude-code" ;;
  *) echo "unsupported OS: $(uname -s)"; exit 1 ;;
esac
F="$DIR/managed-settings.json"

case "$ACTION" in
  manage)
    mkdir -p "$DIR"
    cat > "$F" <<'JSON'
{
  "extraKnownMarketplaces": {
    "mindbowser": { "source": { "source": "github", "repo": "Mindbowser/health-harness" }, "autoUpdate": true }
  },
  "enabledPlugins": { "health-harness@mindbowser": true }
}
JSON
    echo "OK [manage]: wrote $F — plugin enabled + auto-update on. Users restart to get the latest."
    ;;
  unmanage)
    if [ -f "$F" ]; then rm -f "$F"; echo "OK [unmanage]: removed $F — this machine is now user-owned."
    else echo "OK [unmanage]: no managed lock present — already user-owned."; fi
    echo "Next (per user): claude plugin install health-harness@mindbowser   # then restart Claude Code"
    ;;
  refresh)
    # the marketplace cache is PER-USER, so run the refresh as the logged-in user (Fleet often runs as root)
    if [ "$(uname -s)" = "Darwin" ]; then U="$(stat -f%Su /dev/console 2>/dev/null)"
    else U="${SUDO_USER:-$(logname 2>/dev/null || who 2>/dev/null | awk 'NR==1{print $1}')}"; fi
    if [ "$(id -u)" -eq 0 ] && [ -n "$U" ] && [ "$U" != "root" ]; then
      sudo -u "$U" -H sh -lc 'command -v claude >/dev/null 2>&1 && claude plugin marketplace update mindbowser || echo "SKIP: claude not on PATH for this user"'
    elif command -v claude >/dev/null 2>&1; then
      claude plugin marketplace update mindbowser
    else
      echo "SKIP: claude not on PATH — run as the logged-in user, or the dev runs /harness-update."
    fi
    echo "OK [refresh]: catalog refresh attempted. Restart Claude Code (or /reload-plugins) to apply."
    ;;
  *) echo "unknown MB_HARNESS_ACTION: '$ACTION' (use manage | unmanage | refresh)"; exit 1 ;;
esac

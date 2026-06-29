#!/bin/sh
# Fleet script — Ubuntu / Linux / WSL. FORCE catalog refresh: explicitly pull the latest marketplace data so
# Claude Code reliably finds the new version. Use this when auto-update's startup refresh is best-effort and
# sometimes MISSES the new version. PRE-STAGES only — the user must RESTART (or /reload-plugins) to apply.
# Does NOT bypass managed scope (it's just a marketplace refresh, allowed at any scope).
#
# IMPORTANT: the plugin/marketplace cache is PER-USER, so this must run AS THE LOGGED-IN USER. Fleet often
# runs scripts as root — so if we're root, re-exec the refresh as the active desktop user via a login shell.
# If `claude` isn't on that user's PATH, this no-ops with a clear message.
set -e

# best-effort detection of the active desktop user (not root)
U="${SUDO_USER:-$(who 2>/dev/null | awk '/(:0|seat)/{print $1; exit}')}"
[ -z "$U" ] && U="$(logname 2>/dev/null || true)"

if [ "$(id -u)" -eq 0 ] && [ -n "$U" ] && [ "$U" != "root" ]; then
  sudo -u "$U" -H bash -lc 'command -v claude >/dev/null 2>&1 && claude plugin marketplace update mindbowser || echo "SKIP: claude not on PATH for '"$U"'"'
elif command -v claude >/dev/null 2>&1; then
  claude plugin marketplace update mindbowser
else
  echo "SKIP: 'claude' not on PATH — cannot refresh. (Dev can run /harness-update instead.)"
fi
echo "OK: catalog refresh attempted for ${U:-$(whoami)}. Restart Claude Code (or /reload-plugins) to apply the latest."

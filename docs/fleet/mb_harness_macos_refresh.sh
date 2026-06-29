#!/bin/sh
# Fleet script — macOS. FORCE catalog refresh: explicitly pull the latest marketplace data so Claude Code
# reliably finds the new version. Use this when auto-update's startup refresh is best-effort and sometimes
# MISSES the new version. It PRE-STAGES only — the user must RESTART (or /reload-plugins) to apply. It does
# NOT bypass managed scope (it's just a marketplace refresh, which is allowed at any scope).
#
# IMPORTANT: the plugin/marketplace cache is PER-USER, so this must run AS THE LOGGED-IN USER. Fleet often
# runs scripts as root — so if we're root, re-exec the refresh as the console user via a login shell (to
# pick up PATH for the `claude` CLI). If `claude` isn't on that user's PATH, this no-ops with a clear message.
set -e

U="$(stat -f%Su /dev/console 2>/dev/null)"
refresh() {
  if ! command -v claude >/dev/null 2>&1; then
    echo "SKIP: 'claude' not on PATH for this user — cannot refresh. (Dev can run /harness-update instead.)"
    return 0
  fi
  claude plugin marketplace update mindbowser
}

if [ "$(id -u)" -eq 0 ] && [ -n "$U" ] && [ "$U" != "root" ]; then
  # re-exec as the logged-in user through a login shell so PATH/HOME are theirs
  sudo -u "$U" -H bash -lc 'command -v claude >/dev/null 2>&1 && claude plugin marketplace update mindbowser || echo "SKIP: claude not on PATH for '"$U"'"'
else
  refresh
fi
echo "OK: catalog refresh attempted for ${U:-$(whoami)}. Restart Claude Code (or /reload-plugins) to apply the latest."

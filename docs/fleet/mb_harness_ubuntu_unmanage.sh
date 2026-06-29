#!/bin/sh
# Fleet script — Ubuntu / Linux / WSL. UN-MANAGE the harness: remove the org-deployed Claude Code
# managed-settings.json so the plugin is no longer locked at managed scope. After this runs, the machine
# is USER-OWNED — each dev installs / updates / removes the harness themselves at user scope.
#
# Assumes managed-settings.json is harness-only (that's what mb_harness_ubuntu.sh wrote). If your org later
# puts OTHER managed policy in this file, edit out just the harness keys instead of deleting it.
# Idempotent: safe to run repeatedly (no-op if already gone).
set -e

F="/etc/claude-code/managed-settings.json"
if [ -f "$F" ]; then
  rm -f "$F"
  echo "OK: removed managed lock ($F). This machine is now user-owned."
else
  echo "OK: no managed lock present ($F) — already user-owned."
fi
echo "Next (per user): claude plugin install health-harness@mindbowser  # then restart Claude Code"

# Fleet rollout — IT admin test checklist

Run these on **one pilot machine** (with Claude Code installed) before pushing fleet-wide. Each is
**do → expect → verify**. The script is `mb_harness.sh` (macOS/Linux) / `mb_harness.ps1` (Windows) — no
variables, just run it.

**Managed-settings path per OS (used in the verify steps):**

| OS | Path |
|---|---|
| macOS | `/Library/Application Support/ClaudeCode/managed-settings.json` |
| Linux/Ubuntu | `/etc/claude-code/managed-settings.json` |
| Windows | `C:\Program Files\ClaudeCode\managed-settings.json` |

---

### 1. Fresh install
- **Do:** run the script on a machine that doesn't have the harness.
- **Expect:** prints `OK: managed-settings written …` and either `OK: catalog refreshed` **or** `NOTE: …skipped…` (both fine).
- **Verify:** the managed-settings file exists; **restart Claude Code**; `claude plugin list` → `health-harness@mindbowser`, **Scope: managed**, **enabled**, on the latest version.

### 2. Push an update (re-run the same script)
- **Do:** after a newer release exists, **re-run the same script**.
- **Expect:** same output (it re-writes settings + refreshes the catalog).
- **Verify:** **restart Claude Code** → `claude plugin list` shows the newer version. *(This is the "force update" path — same script as install.)*

### 3. Auto-update on restart (no script)
- **Do:** when a new release is out, just **restart** Claude Code.
- **Expect:** version moves up on its own.
- **Verify:** `claude plugin list` before vs after restart → version increased. *(Best-effort; if it didn't move, scenario 2 forces it.)*

### 4. Dev self-serve "update now" — `/harness-update`
- **Do:** in a dev's Claude Code, run `/harness-update`.
- **Expect:** reports `old → new` + a reload/restart step. **Does not** error "not installed at scope user".
- **Verify:** after restart, `claude plugin list` shows the latest.

### 5. Idempotent / self-healing
- **Do:** run the script **twice**.
- **Expect:** no error either time; managed-settings identical.
- **Verify:** safe to wire as a Fleet **policy remediation** (re-runs without harm).

### 6. Refresh-context resilience
- **Do:** run the script in a context where `claude` isn't on the user's PATH (e.g. Fleet as root/SYSTEM and the user's shell not loaded).
- **Expect:** the refresh half prints `NOTE: …skipped…` — **the script still succeeds** (exit 0), managed-settings is written, and auto-update catches up on the next restart.
- **Verify:** restart → version still lands the latest (just via auto-update instead of the pre-staged refresh).

---

## Sign-off

- [ ] 1 — install: managed scope, enabled, latest version
- [ ] 2 — re-run pushes a newer release
- [ ] 3 — restart auto-updates on its own
- [ ] 4 — `/harness-update` works for a dev (no scope error)
- [ ] 5 — re-running is harmless (policy-safe)
- [ ] 6 — refresh soft-skips without failing the script

If all six pass on the pilot, the script is safe to push fleet-wide.

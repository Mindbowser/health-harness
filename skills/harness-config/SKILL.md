---
name: harness-config
description: Review and change the harness settings interactively — see every default, flip what's configurable, and see what org policy enforces. Also the first-run onboarding.
argument-hint: "(optional) a setting to jump to, e.g. protectedBranches"
---

Show the dev what the harness is doing and let them tune the parts they own — as a **structured popup with
the defaults already filled in**, not a JSON file to hand-edit. Used two ways: **first run** (from `/start`,
when nothing is configured yet) and **any time after** (`/harness-config`).

## The two tiers — never blur them

- 🔒 **Locked (org policy)** — secret/PHI scanning, branch protection, ticket-keyed commits, the test gate,
  redaction egress. **Shown for transparency, never offered as a choice.** There is no command to disable
  them; a confirmed false positive in the scan is cleared per-finding with `harness-allowlist`, which is
  audited. Do NOT present these as questions.
- ⚙️ **Configurable** — everything else. Show the current value, mark whether it's still the default, and
  let the dev change it.

## Process

1. **Read the plan deterministically — don't re-derive what's configurable:**
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/harness-config.js" plan
   ```
   → `{ configured: {repo, user, any}, plan: [{group, locked, items:[{key, value, default, source, tier, locked, type, layer, changed}]}] }`.
   `configured.any === false` means **first run** — say so in one line and walk the groups. Otherwise this is
   a settings review: show current values and only ask about what they want to change.

2. **Show the locked group FIRST, as readable text, not a question.** One short block so the dev sees what
   is enforced before what they choose. State plainly that these can't be turned off and why (they're the
   org's floor, and the remedy for a false positive is the audited allowlist, not a disable switch).

3. **Batch the confident defaults into ONE confirmation.** Do not ask a question per setting — that turns
   onboarding into a form. Present the configurable groups as readable text with their defaults, then a
   single `AskUserQuestion`:
   - **"Accept these defaults"** (FIRST — one keypress)
   - **"Change some"** → then, and only then, ask per-group popups for the ones they name
   - **"Other"** (always available) for free-text
   Only break a setting out into its own question when the right value is genuinely repo-specific and you
   can't infer it — in practice that's **`protectedBranches`** (a trunk-based repo needs a different set)
   and **`branchNaming`** when the repo's observed convention disagrees with the default.

4. **Write each accepted change through the one store** (it refuses locked keys and merges rather than
   clobbers, so unrelated settings survive):
   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/bin/harness-config.js" set <key> <value>
   ```
   Repo-layer keys land in committed `.health-harness/settings.json` (shared by the team); user-layer keys
   (`sound.enabled`, `diffReviewBeforePush`) land in `~/.health-harness/settings.json` and are personal —
   say which is which when you confirm, so nobody is surprised that a teammate inherited their choice.

5. **Confirm what changed in one line each** (`key: old → new`), and nothing else. If they accepted every
   default, say that in a single line — don't re-list the settings.

## Rules

- **Never present a locked setting as a toggle**, and never offer to disable scanning. If asked, explain the
  allowlist path instead.
- **Never increase the prompt count**: defaults batch into one popup; a per-setting question is the
  exception, not the shape.
- **Absence of config = today's behavior.** Every setting is safe-defaulted, so a dev who skips onboarding
  entirely still gets working, unchanged behavior. Skipping is a valid answer.
- Values are typed (`boolean`, `list`, `string`). A list takes comma-separated input (`main,dev,qa`).

## Anti-patterns

- ❌ A question per setting (a 15-click wizard nobody finishes).
- ❌ Asking about locked rules, or implying they can be turned off.
- ❌ Hand-editing `settings.json` instead of `harness-config set` (loses validation + merge semantics).
- ❌ Re-asking settings the dev already chose — `changed: true` means they decided; leave it alone.

## Completion criteria

- [ ] The locked group was shown as read-only context, not as choices.
- [ ] Configurable defaults were offered in ONE batched confirmation; per-setting questions only where genuinely repo-specific.
- [ ] Every accepted change was written via `harness-config set` and confirmed as `key: old → new`.
- [ ] The dev was told which changes are shared (repo) vs personal (user).

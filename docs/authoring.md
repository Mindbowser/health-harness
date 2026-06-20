# Authoring & distribution

The authoring *contract* lives in `skills/writing-great-skills/SKILL.md` (read it first).
This file covers the repo-level mechanics around it.

## Layout — FLAT (one level)

```
skills/<skill-name>/SKILL.md   # one dir per skill, kebab-case, directly under skills/
skills/<skill-name>/*.md       # optional supporting files (methods, templates, glossaries)
```

**Do not nest skills in category subfolders.** Claude Code discovers plugin skills at
`skills/<name>/SKILL.md` only (one level) — `skills/process/align/SKILL.md` is NOT found. Grouping
(process / governance / archetypes / authoring) is a *labelling* concept we keep in docs, not a
directory structure.

## Frontmatter contract

`name` (= dir name), `description` (trigger-verb-first), optional `disable-model-invocation` (true =
user-only) and `argument-hint`. See the meta-skill for the full decision guide.

## Review & merge

1. Open a PR. CODEOWNERS (the harness guild) reviews against the meta-skill's completion criteria.
2. The author confirms the skill was **dog-fooded once** on a real task.
3. Squash-merge with a conventional-commit title (`feat(skill): …`).

## Distribution (evolving)

- **Central source of truth = this repo.** Projects consume it as a Claude Code plugin; updating here
  updates everyone.
- **Hybrid override:** a project keeps a small local `.claude/skills/` for stack/client-specific skills
  on top of these org-wide ones. Local adds; central wins for shared names.
- **Versioning:** semver tags on this repo; a project can pin a version and upgrade deliberately.

## Built so far (grouped by role; all live flat under `skills/`)

- **Build Loop:** `align`, `to-prd`, `to-issues`, `tdd`.
- **Sprint:** `sprint` (set/show the active sprint; the loop files artifacts under `.mb-harness/sprints/<id>/`).
- **Governance:** `compliance-profile`, `phi-redaction-check` (static, pre-export), `safe-logging`
  (runtime — keep PHI *out*), `audit-logging` (runtime — *record* ePHI access for HIPAA).
- **Entry / front doors:** `start` (router — detect new vs existing + route),
  `scaffold-from-boilerplate` (new repo), `onboard-existing-codebase` (existing repo).
- **Tracker:** `import-issues` (PULL stories/bugs from Jira/Linear; PUSH-back lives in `to-issues`).
- **Authoring:** `writing-great-skills`.
- **Tooling:** `bin/redaction-scan.js` — the deterministic scanner behind `phi-redaction-check`
  (profile-driven, default `hipaa`; tested via `npm test`).
- **The wall:** `hooks/hooks.json` + `hooks/outward-guard.js` — a PreToolUse hook that DENIES
  catastrophic commands and ASKS (user approval) for any outward action (push/PR/Jira-write/infra).
  Enforcement, not instructions. Tested in `test/outward-guard.test.js`.
- **Guides:** `docs/delivery-mental-model.md` (the three-plane model + role lenses + clean architecture
  + scaling), `docs/add-to-existing-repo.md` (drop-in one-pager), `docs/multi-repo.md` (FE/BE/infra
  workspace pattern), `docs/jira.md` (tracker connection + round-trip).

## Roadmap (not yet built)

- `from-design` (Figma/prototype ingestion).
- Workspace-awareness for `/start` + `/sprint` (detect a multi-repo workspace vs a single repo).
  *(A Studio prototype handover is NOT a dev-facing front door — to the receiving dev it's just an
  existing repo, handled by `/onboard-existing-codebase`.)*
- `diagnosing-bugs`, `handoff`, `codebase-design` / `improve-codebase-architecture`, stack packs.

# Authoring & distribution

The authoring *contract* lives in `skills/authoring/writing-great-skills/SKILL.md` (read it first).
This file covers the repo-level mechanics around it.

## Layout

```
skills/<category>/<skill-name>/SKILL.md   # one dir per skill, kebab-case
skills/<category>/<skill-name>/*.md       # optional supporting files (methods, templates, glossaries)
```

Categories today: `process/` (the Build Loop), `governance/` (healthcare compliance), `authoring/`
(meta). Add a category only when a skill genuinely doesn't fit an existing one.

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

## Roadmap (not yet built)

- `governance/` skills: `phi-redaction-check`, `compliance-profile`, `secrets-scan`
  (generalize mbi-studio's `redaction-validator.js`).
- Archetype front doors: `scaffold-from-boilerplate` (greenfield, first), `from-studio-handover`,
  `onboard-existing-codebase` (brownfield), `import-issues`, `from-design`.
- `diagnosing-bugs`, `handoff`, `codebase-design` / `improve-codebase-architecture`, stack packs.

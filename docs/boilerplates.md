# Boilerplate registry — one boilerplate per stack, resolved automatically

`/scaffold-from-boilerplate` picks the right starter repo for a new project by looking up the chosen
**tech stack** in a **central registry** — so devs never paste a URL and adding a new stack never needs a
plugin release. Resolver: `bin/boilerplate-registry.js` (`list` / `resolve "<stack>"`).

## The registry (single source of truth)

A `registry.json` in a central repo — default **`Mindbowser/boilerplates`** — maps each stack to its repo:

```json
{
  "react-node": { "repo": "https://github.com/Mindbowser/bp-react-node", "kind": "monorepo",
                  "aliases": ["react+node", "mern"], "description": "React/TS + Node/Express/Postgres" },
  "nextjs":     { "repo": "https://github.com/Mindbowser/bp-nextjs",     "kind": "frontend" },
  "fastapi":    { "repo": "https://github.com/Mindbowser/bp-fastapi",    "kind": "backend" },
  "react-native": { "repo": "https://github.com/Mindbowser/bp-react-native", "kind": "frontend",
                    "aliases": ["expo", "rn"] }
}
```

- **`repo`** (required) — the boilerplate git URL (clone-only; the scaffold re-inits a fresh repo).
- **`kind`** — `frontend` | `backend` | `monorepo` (drives the project layout).
- **`aliases`** — extra names that should resolve here (matching is case/punctuation-insensitive and fuzzy,
  so `"Next.js"`, `"react+node"`, `"fast api"` all work without aliases too).
- **Add a stack** = a one-line PR to this file. It's live for everyone immediately — no harness release.

## One-time setup (org)

1. **Create the registry repo** `Mindbowser/boilerplates` with a `registry.json` like above (one entry per
   existing per-stack boilerplate you already have).
2. **Mint a read-only PAT** that can clone the private boilerplate repos, and distribute it as
   `MB_BOILERPLATE_TOKEN` — globally via each dev's `~/.claude/settings.json` → `env` now, or org-wide via
   FleetDM managed settings later (same pattern as the telemetry token):
   ```jsonc
   { "env": { "MB_BOILERPLATE_TOKEN": "<read-only PAT>" } }
   ```
   Reading the registry itself uses the dev's `gh` auth (private-repo aware), so no extra config for that.

## Overrides

- **`MB_BOILERPLATE_REGISTRY`** — point at a different registry: `owner/repo`, `owner/repo:path/to/registry.json`,
  or a raw `https://…` URL. Default: `Mindbowser/boilerplates` (`registry.json`).
- **`MB_BOILERPLATE_TOKEN`** (or `MB_GITHUB_TOKEN`) — PAT used to clone private boilerplates (and a raw-URL
  registry).

## How the skill uses it

```bash
node bin/boilerplate-registry.js list                 # → the menu of stacks
node bin/boilerplate-registry.js resolve "react+node" # → {"key":"react-node","repo":"…","kind":"monorepo"}
```
The skill resolves the user's stated stack; if unspecified/ambiguous it shows `list` and asks. If nothing
matches it prints the available stacks rather than inventing a URL.

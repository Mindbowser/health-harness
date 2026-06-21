# Boilerplate registry — one boilerplate per stack, resolved automatically

`/scaffold-from-boilerplate` picks the right starter repo for a new project by looking up the chosen
**tech stack** in a registry — so devs never paste a URL. Resolver: `bin/boilerplate-registry.js`
(`list` / `resolve "<stack>"`).

## Where the registry lives

**Baked into the plugin** at `config/boilerplates.json` — **zero setup**, ships with the harness. The
non-secret repo URLs live here; the only thing a dev needs is the clone token (below). Entry shape:

```json
{
  "nextjs":      { "repo": "https://github.com/Mindbowser/nextjs-boilerplate", "kind": "frontend",
                   "aliases": ["next", "next.js"], "description": "Next.js" },
  "spring-fhir": { "repo": "https://github.com/Mindbowser/spring-fhir-boilerplate", "kind": "backend",
                   "aliases": ["fhir"], "description": "Spring Boot + FHIR (healthcare)" }
}
```

- **`repo`** (required) — the boilerplate git URL (clone-only; the scaffold re-inits a fresh repo).
- **`kind`** — `frontend` | `backend` | `monorepo` (drives the project layout).
- **`aliases`** — extra names that resolve here (matching is case/punctuation-insensitive and fuzzy, so
  `"Next.js"`, `"spring boot"`, `"react native expo"` resolve without needing an alias).

**Add or change a stack** = edit `config/boilerplates.json` → `npm run release`. Devs pick it up on the next
plugin auto-update.

## The one thing that's NOT baked in: the clone token

The boilerplate repos are **private**, so cloning needs `MB_BOILERPLATE_TOKEN` (a read-only PAT). It is a
**secret**, so it is deliberately **not** in the plugin — set it once, globally, in each dev's
`~/.claude/settings.json` → `env` (or org-wide via FleetDM managed settings):

```jsonc
{ "env": { "MB_BOILERPLATE_TOKEN": "<read-only PAT that can clone the private boilerplates>" } }
```

(`MB_GITHUB_TOKEN` is accepted as a fallback. Reading the *registry* needs nothing — it's baked in.)

## Optional: point at a central registry repo instead

If you'd rather edit the stack list without a harness release, set **`MB_BOILERPLATE_REGISTRY`** to a
central source — `owner/repo`, `owner/repo:path/to/registry.json`, or a raw `https://…` URL. When set, the
resolver reads from there (private repos via your `gh` auth) instead of the baked-in file. Adding a stack
then becomes a one-line PR to that repo, instantly live. Leave it unset to use the baked-in default.

## How the skill uses it

```bash
node bin/boilerplate-registry.js list                 # the menu of stacks
node bin/boilerplate-registry.js resolve "react+node" # → {"key","repo","kind"}
```
The skill resolves the user's stated stack; if unspecified/ambiguous it shows `list` and asks. If nothing
matches it prints the available stacks rather than inventing a URL.

## Current stacks (baked in)

react-ts · reactjs · nextjs · angular · react-native · react-native-expo · flutter · nodejs ·
node-express-ts · nestjs · django · rails · spring-rest · spring-jwt · spring-auth0 · spring-ai · spring-fhir

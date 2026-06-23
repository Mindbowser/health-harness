#!/usr/bin/env node
/**
 * preflight.js — deterministic first-run connectivity checks for onboarding (`/start` calls it). Turns the
 * silent failures a new user hits (no git email → mis-attributed commits/metrics; no remote → push fails
 * mid-build; no test gate → no safe AFK build) into a clear, actionable checklist with fix commands.
 *
 * It can only check what's deterministic from the shell/filesystem. The Jira/Linear MCP connectivity check
 * stays an agent action (try to list issues) — here we only report whether coords are recorded.
 *
 * Pure (assess / renderPreflight) is exported for tests; gather()/main() are impure.
 */
'use strict';

const PERSONAL = /@(gmail|yahoo|outlook|hotmail|icloud|proton(mail)?|live|aol)\./i;

/** Pure: facts → an ordered checklist of {key,status,label,detail,fix}. status ∈ ok|warn|fail. */
function assess(f) {
  const checks = [];
  const email = f.email || '';
  if (!email) checks.push({ key: 'git_email', status: 'fail', label: 'Git identity', detail: 'user.email is not set', fix: 'git config user.email you@mindbowser.com' });
  else if (PERSONAL.test(email)) checks.push({ key: 'git_email', status: 'warn', label: 'Git identity', detail: `${email} looks personal — use your company email (commits, PRs, and usage metrics key off it)`, fix: 'git config user.email you@mindbowser.com' });
  else checks.push({ key: 'git_email', status: 'ok', label: 'Git identity', detail: email, fix: '' });

  if (!f.hasRemote) checks.push({ key: 'git_remote', status: 'warn', label: 'Git remote', detail: 'no origin — pushing a branch will fail later', fix: 'git remote add origin <url>' });
  else if (f.remoteReachable === false) checks.push({ key: 'git_remote', status: 'warn', label: 'Git remote', detail: 'origin set but not reachable/authenticated — push will fail (check your SSH key, `gh auth login`, or token)', fix: 'verify creds: git ls-remote origin' });
  else checks.push({ key: 'git_remote', status: 'ok', label: 'Git remote', detail: f.remoteReachable ? 'origin set + reachable' : 'origin set', fix: '' });

  // GitHub CLI — /ship opens the PR with it; missing/unauthed gh is why ship silently drops to paste-mode.
  // (Absent f.gh ⇒ skip the check, for back-compat with callers that don't probe it.)
  const gh = f.gh;
  if (gh) {
    if (!gh.installed) checks.push({ key: 'gh', status: 'warn', label: 'GitHub CLI (gh)', detail: "not installed — one easy publish path (PR + HTTPS push-auth in one step). Or skip gh entirely with a connected GitHub MCP (commits files + opens the PR via its own token, no local creds — trades local commit history for fresh API commits); else paste-mode", fix: gh.installHint || 'install the GitHub CLI: https://cli.github.com' });
    else if (!gh.authed) checks.push({ key: 'gh', status: 'warn', label: 'GitHub CLI (gh)', detail: 'installed but not authenticated — PR creation will fail until you log in', fix: 'gh auth login' });
    else checks.push({ key: 'gh', status: 'ok', label: 'GitHub CLI (gh)', detail: 'installed + authenticated', fix: '' });
  }

  if (f.branch && /^(main|master|develop)$/i.test(f.branch)) checks.push({ key: 'branch', status: 'warn', label: 'Branch', detail: `on base branch '${f.branch}' — branch before your first commit (the wall will stop a base-branch commit)`, fix: 'git checkout -b feature/<name>' });
  else checks.push({ key: 'branch', status: 'ok', label: 'Branch', detail: f.branch || '(none yet)', fix: '' });

  const g = f.gate || {};
  if (!g.hasTestScript) checks.push({ key: 'gate', status: 'fail', label: 'Feedback-loop gate', detail: 'no test gate found — establish one (characterization tests) before any AFK build', fix: '' });
  else if (g.isStub) checks.push({ key: 'gate', status: 'fail', label: 'Feedback-loop gate', detail: 'test script is the default stub ("no test specified") — that is not a gate', fix: '' });
  else checks.push({ key: 'gate', status: 'ok', label: 'Feedback-loop gate', detail: 'test gate present', fix: '' });

  if (!f.compliance) checks.push({ key: 'compliance', status: 'warn', label: 'Compliance profile', detail: 'not set — onboarding will default to hipaa', fix: 'run /compliance-profile' });
  else checks.push({ key: 'compliance', status: 'ok', label: 'Compliance profile', detail: 'set', fix: '' });

  if (!f.jiraCoords) checks.push({ key: 'tracker', status: 'warn', label: 'Tracker (Jira/Linear)', detail: 'no coords recorded — connect the MCP or note paste-mode (the agent verifies the live connection)', fix: 'see docs/jira.md' });
  else checks.push({ key: 'tracker', status: 'ok', label: 'Tracker (Jira/Linear)', detail: 'coords recorded', fix: '' });

  // role — set once so /align doesn't have to guess your mode (PM/BA vs Engineer)
  if (!f.role) checks.push({ key: 'role', status: 'warn', label: 'MB Harness role', detail: 'not set — /align will guess your mode (PM/BA vs Engineer); set it once', fix: 'run /role pm|engineer' });
  else checks.push({ key: 'role', status: 'ok', label: 'MB Harness role', detail: f.role, fix: '' });

  // DB migration layer — only relevant when a database is present (skip silently otherwise)
  const db = f.db || {};
  if (db.present && !db.hasMigrationLayer) checks.push({ key: 'migrations', status: 'warn', label: 'DB migration layer', detail: 'a database is present but no migration tool detected — schema changes have no safe, reversible path', fix: 'add a migration layer (Prisma / Knex / TypeORM / Alembic / Liquibase / Rails / Django / …)' });
  else if (db.present) checks.push({ key: 'migrations', status: 'ok', label: 'DB migration layer', detail: 'present', fix: '' });

  return checks;
}

const GLYPH = { ok: '✅', warn: '⚠️ ', fail: '❌' };

/** Pure: render the checklist; fixes only shown for non-ok items. */
function renderPreflight(checks) {
  const L = ['MB Harness — onboarding pre-flight:'];
  for (const c of checks) {
    L.push(`  ${GLYPH[c.status] || '·'} ${c.label} — ${c.detail}`);
    if (c.status !== 'ok' && c.fix) L.push(`       ↳ ${c.fix}`);
  }
  const fails = checks.filter((c) => c.status === 'fail').length;
  const warns = checks.filter((c) => c.status === 'warn').length;
  L.push(fails ? `\n${fails} blocker(s)${warns ? `, ${warns} warning(s)` : ''} — clear the ❌ before building.`
    : warns ? `\nReady — ${warns} warning(s) worth a look.` : `\nAll clear — you're set.`);
  return L.join('\n');
}

module.exports = { assess, renderPreflight };

// ── orchestration (impure) ──────────────────────────────────────────────────────
function gather() {
  const fs = require('fs'), path = require('path');
  const { execSync } = require('child_process');
  const run = (c) => { try { return execSync(c, { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim(); } catch { return ''; } };
  const inRepo = run('git rev-parse --is-inside-work-tree') === 'true';
  const email = run('git config user.email') || null;
  const hasRemote = !!run('git remote');
  // Can we actually REACH + auth to the remote? `git ls-remote` verifies read connectivity (catches the
  // common "no SSH key / wrong URL / not logged in" cases before they bite at push). Non-interactive +
  // time-boxed so it can't hang or prompt. Read-auth ≠ write-perm, but it's the cheap deterministic check.
  let remoteReachable; // true | false | undefined(not checked)
  if (hasRemote) {
    try {
      require('child_process').execSync('git ls-remote origin', {
        stdio: ['ignore', 'ignore', 'ignore'], timeout: 6000,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_SSH_COMMAND: 'ssh -oBatchMode=yes -oConnectTimeout=5' },
      });
      remoteReachable = true;
    } catch { remoteReachable = false; }
  }
  const branch = run('git rev-parse --abbrev-ref HEAD') || null;

  // GitHub CLI: installed? authenticated? (so /start can offer to set it up before the first /ship)
  const ghInstalled = !!run('gh --version');
  let ghAuthed = false;
  if (ghInstalled) { try { execSync('gh auth status', { stdio: 'ignore' }); ghAuthed = true; } catch { ghAuthed = false; } }
  const ghInstallHint = process.platform === 'darwin' ? 'brew install gh   (then: gh auth login)'
    : process.platform === 'win32' ? 'winget install --id GitHub.cli   (then: gh auth login)'
    : 'install gh — https://cli.github.com  (Debian/Ubuntu: sudo apt install gh) — then: gh auth login';
  const gh = { installed: ghInstalled, authed: ghAuthed, installHint: ghInstallHint };

  let gate = { hasTestScript: false, isStub: false };
  try {
    const pkg = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
    const t = (pkg.scripts && pkg.scripts.test) || '';
    gate = { hasTestScript: !!t, isStub: /no test specified/i.test(t) };
  } catch { /* no package.json — leave hasTestScript false (other ecosystems: the agent confirms the gate) */ }

  const hh = path.join(process.cwd(), '.health-harness');
  const compliance = fs.existsSync(path.join(hh, 'compliance.json'));
  let jiraCoords = false;
  try { const p = JSON.parse(fs.readFileSync(path.join(hh, 'project.json'), 'utf8')); jiraCoords = !!(p.jira && (p.jira.projectKey || p.jira.cloudId)); } catch { /* none */ }

  // role is user-level (persists across projects)
  let role = null;
  try { role = (fs.readFileSync(path.join(require('os').homedir(), '.health-harness', 'role'), 'utf8').split('\n')[0].trim()) || null; } catch { /* unset */ }

  return { inRepo, email, hasRemote, branch, gh, gate, compliance, jiraCoords, role, db: detectDb(fs, path) };
}

/** Heuristic: is a DB present in this repo, and is there a migration layer? Best-effort (a warn, not a gate). */
function detectDb(fs, path) {
  const cwd = process.cwd();
  const exists = (p) => { try { return fs.existsSync(path.join(cwd, p)); } catch { return false; } };
  const anyFile = (re, dir) => { try { return fs.readdirSync(path.join(cwd, dir)).some((n) => re.test(n)); } catch { return false; } };
  // dependencies that imply a database (JS + Python)
  let deps = '';
  try { const p = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8')); deps = JSON.stringify({ ...p.dependencies, ...p.devDependencies }); } catch { /* none */ }
  let py = '';
  for (const f of ['requirements.txt', 'pyproject.toml', 'Pipfile']) { try { py += fs.readFileSync(path.join(cwd, f), 'utf8'); } catch { /* none */ } }
  const DB_DEP = /\b(pg|mysql2?|mongoose|mongodb|sqlite3|better-sqlite3|typeorm|prisma|@prisma\/client|sequelize|knex|drizzle-orm|sqlalchemy|psycopg2?|django|asyncpg|mongoengine)\b/i;
  const MIG_DEP = /\b(prisma|knex|typeorm|sequelize|sequelize-cli|drizzle-kit|alembic|flyway|liquibase|node-pg-migrate|db-migrate|@mikro-orm\/migrations)\b/i;
  // config/dir markers
  const dbMarker = exists('prisma/schema.prisma') || exists('knexfile.js') || exists('knexfile.ts') || exists('ormconfig.json') || exists('alembic.ini') || exists('db/schema.rb') || exists('drizzle.config.ts') || DB_DEP.test(deps) || DB_DEP.test(py);
  const migMarker = exists('prisma/migrations') || exists('migrations') || exists('db/migrate') || exists('alembic') || exists('liquibase.properties') || anyFile(/knexfile/, '.') || exists('drizzle.config.ts') || MIG_DEP.test(deps) || MIG_DEP.test(py);
  return { present: !!dbMarker, hasMigrationLayer: !!migMarker };
}

if (require.main === module) {
  const f = gather();
  if (!f.inRepo) { process.stdout.write('MB Harness — onboarding pre-flight: ❌ not inside a git repo — run `git init` first.\n'); process.exit(0); }
  process.stdout.write(renderPreflight(assess(f)) + '\n');
}

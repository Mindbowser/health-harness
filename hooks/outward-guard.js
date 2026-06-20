#!/usr/bin/env node
/**
 * outward-guard.js — the MB Health Harness "wall" (PreToolUse hook).
 *
 * Deterministic enforcement (not instruction-level): before any Bash or MCP tool runs, this decides
 *   - "deny"  → catastrophic / irreversible. Hard-blocked; the agent cannot do it.
 *   - "ask"   → outward / mutating (push, PR, Jira write, infra, package publish). The USER must approve.
 *   - (none)  → defer to normal flow. Reads + local/reversible work are untouched.
 *
 * Contract (Claude Code PreToolUse): reads JSON on stdin (tool_name, tool_input), prints a JSON
 * { hookSpecificOutput: { hookEventName, permissionDecision, permissionDecisionReason } } and exits 0.
 * Fail-safe: any parse/logic error → no decision (defer), never crashes the tool flow.
 */
'use strict';

// ── catastrophic / irreversible → DENY ────────────────────────────────────────
const DENY = [
  [/\brm\s+-\w*[rf]\w*\s+(\/|~|\$home)(\s|$|\/|\*)/i, 'rm -rf of / ~ or $HOME'],
  [/\brm\s+-\w*[rf]\w*\s+.*--no-preserve-root/i, 'rm --no-preserve-root'],
  [/git\s+push\b[^\n]*(--force\b|--force-with-lease|\s-f\b)/i, 'force-push (rewrites remote history)'],
  [/\bdrop\s+(database|schema|table)\b/i, 'dropping a database/schema/table'],
  [/\btruncate\s+table\b/i, 'truncating a table'],
  [/:\s*\(\s*\)\s*\{[^}]*\}\s*;\s*:/, 'fork bomb'],
  [/\bmkfs\b/i, 'formatting a filesystem'],
  [/\bdd\s+if=.*of=\/dev\//i, 'dd to a block device'],
];

// ── outward / mutating → ASK (user approves) ──────────────────────────────────
const ASK = [
  [/git\s+push\b/i, 'git push — pushing to a remote is outward'],
  [/gh\s+pr\s+(create|merge|ready)\b/i, 'opening/merging a PR is outward'],
  [/gh\s+(release|repo\s+create)\b/i, 'creating a release/repo is outward'],
  [/git\s+remote\s+(add|set-url)\b/i, 'changing git remotes'],
  [/\brm\s+-\w*[rf]\w*\b/i, 'rm -rf — destructive delete'],
  [/\bgit\s+reset\s+--hard\b/i, 'git reset --hard — discards changes'],
  [/\bgit\s+clean\s+-\w*f/i, 'git clean -f — deletes untracked files'],
  [/\b(npm|pnpm|yarn)\s+publish\b/i, 'package publish — outward'],
  [/\bdocker\s+push\b/i, 'docker push — outward'],
  [/\b(kubectl|terraform|aws|gcloud|az)\b[^\n]*\b(apply|delete|destroy|deploy|create|rm)\b/i, 'cloud/infra mutation — outward'],
  [/\bcurl\b[^\n]*-X\s*(POST|PUT|DELETE|PATCH)\b/i, 'curl write request — possible outward mutation'],
];

// MCP write verbs → ASK (Jira/Linear/GitHub writes). Read verbs are left to defer.
const MCP_WRITE = /(create|update|edit|add|delete|remove|transition|move|assign|comment|post|put|push|write|close|resolve|set)/i;

// ── base-branch commit guard → ASK ────────────────────────────────────────────
// A freshly-cloned repo sits on the base branch (main/master, or the repo's
// configured baseBranch). Work belongs on a feature branch — so committing
// directly on a base branch ASKs (approve = the deliberate override). The repo's
// very first commit (no HEAD history yet) is allowed; not-a-git-repo defers.
const COMMIT_RE = /\bgit\s+commit\b/i;

function baseBranches(dir) {
  const bases = new Set(['main', 'master']);
  try {
    const fs = require('fs'), path = require('path');
    const j = JSON.parse(fs.readFileSync(path.join(dir, '.health-harness', 'project.json'), 'utf8'));
    const b = (j.git && j.git.baseBranch) || j.defaultBranch;
    if (b) bases.add(String(b));
  } catch { /* no project.json → just main/master */ }
  return [...bases];
}

function gitProbe(cwd) {
  const dir = cwd || process.cwd();
  try {
    const { execSync } = require('child_process');
    const run = (c) => execSync(c, { cwd: dir, stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim();
    try { run('git rev-parse --verify HEAD'); } catch { return { hasHistory: false }; } // initial commit allowed
    return { hasHistory: true, branch: run('git rev-parse --abbrev-ref HEAD'), bases: baseBranches(dir) };
  } catch { return null; } // not a git repo / git missing → defer
}

function decideCommitGuard(command, st) {
  if (!COMMIT_RE.test(String(command || ''))) return null;
  if (!st || !st.hasHistory || !st.branch) return null; // initial commit / unknown → defer
  const bases = st.bases && st.bases.length ? st.bases : ['main', 'master'];
  if (bases.includes(st.branch)) {
    return { action: 'ask', reason: `health-harness wall: committing directly on the base branch (${st.branch}). Create a feature branch first, or approve to commit on ${st.branch}.` };
  }
  return null;
}

function decideBash(command) {
  const cmd = String(command || '');
  for (const [re, why] of DENY) if (re.test(cmd)) return { action: 'deny', reason: `health-harness wall — blocked: ${why}. If genuinely required, a human runs it outside the agent.` };
  for (const [re, why] of ASK) if (re.test(cmd)) return { action: 'ask', reason: `health-harness wall: ${why}. Approve to proceed.` };
  return null;
}

function decideMcp(tool) {
  if (MCP_WRITE.test(String(tool || ''))) {
    return { action: 'ask', reason: `health-harness wall: writing to an external system (${tool}). Approve to proceed.` };
  }
  return null;
}

function decide(toolName, toolInput, gitState) {
  try {
    if (toolName === 'Bash') {
      const cmd = (toolInput || {}).command;
      return decideBash(cmd) || decideCommitGuard(cmd, gitState !== undefined ? gitState : gitProbe());
    }
    if (String(toolName).startsWith('mcp__')) return decideMcp(toolName);
  } catch { /* fail-safe: defer */ }
  return null;
}

module.exports = { decide, decideBash, decideMcp, decideCommitGuard, gitProbe, baseBranches };

// ── hook entry ────────────────────────────────────────────────────────────────
if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    let d = null;
    try {
      const input = JSON.parse(raw || '{}');
      d = decide(input.tool_name, input.tool_input);
    } catch { /* defer */ }
    if (d) {
      process.stdout.write(JSON.stringify({
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: d.action,
          permissionDecisionReason: d.reason,
        },
      }));
    }
    process.exit(0);
  });
}

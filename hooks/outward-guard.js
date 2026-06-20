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

function decide(toolName, toolInput) {
  try {
    if (toolName === 'Bash') return decideBash((toolInput || {}).command);
    if (String(toolName).startsWith('mcp__')) return decideMcp(toolName);
  } catch { /* fail-safe: defer */ }
  return null;
}

module.exports = { decide, decideBash, decideMcp };

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

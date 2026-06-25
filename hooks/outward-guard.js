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

// ── commit-message gate → DENY (agent self-corrects; no human needed) ─────────
// Deterministic format enforcement so messages aren't guessed: conventional type prefix, and (opt-in) a
// ticket key for traceability + the worklog signal. DENY (not ASK) because a malformed message is the
// agent's to fix and retry — don't bother the human. Policy from project.json `commit`; conventional is on
// by default (core harness discipline), requireTicket off by default (project-specific; /start sets it).
// Only fires when a `-m` message is visible — editor/`-F` commits can't be inspected, so they defer.
const CONV_TYPES = ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'];
const TICKET_RE = /\b[A-Z][A-Z0-9]+-\d+\b/;

/** Pure: pull the -m / --message subject from a git commit command (handles -m"x", -m 'x', -am "x",
 * --message="x"). Returns null if not a commit or no inline message (→ defer). */
function extractCommitMessage(command) {
  const cmd = String(command || '');
  if (!COMMIT_RE.test(cmd)) return null;
  const m = cmd.match(/(?:--message|-[a-zA-Z]*m)[=\s]*(['"])([\s\S]*?)\1/);
  return m ? m[2] : null;
}

/** Pure: validate a commit message against policy. null = ok/inapplicable; else { reason, kind }.
 * kind='format' (malformed → DENY, agent self-corrects) vs kind='ticket' (no linked ticket → ASK, the
 * human overrides per commit — the agent can't invent a ticket). requireTicket is ON by default
 * (commit.requireTicket=false opts out); it's satisfied by a key in the MESSAGE or on the BRANCH. */
function checkCommitMessage(message, policy, branch) {
  if (message == null) return null; // no inspectable message → defer
  const p = policy || {};
  const subject = String(message).split('\n')[0].trim();
  if (p.conventional !== false) {
    const types = (Array.isArray(p.types) && p.types.length ? p.types : CONV_TYPES);
    if (!new RegExp(`^(${types.join('|')})(\\([^)]+\\))?!?: .+`).test(subject)) {
      return { kind: 'format', reason: `commit message isn't conventional — use "type(scope): subject" (types: ${CONV_TYPES.join(', ')}). Got: "${subject.slice(0, 60)}"` };
    }
  }
  if (p.requireTicket !== false) { // ON by default
    const hasTicket = TICKET_RE.test(String(message)) || (branch && TICKET_RE.test(String(branch)));
    if (!hasTicket) {
      return { kind: 'ticket', reason: 'no Jira ticket linked to this work — name the branch (e.g. feature/ABC-123-…) or add the key to the message, or commit anyway to override (set commit.requireTicket=false to disable).' };
    }
  }
  return null;
}

/** Read project.json `commit` policy (defaults: conventional on, requireTicket off). */
function commitPolicy(dir) {
  try {
    const fs = require('fs'), path = require('path');
    const j = JSON.parse(fs.readFileSync(path.join(dir || process.cwd(), '.health-harness', 'project.json'), 'utf8'));
    return j.commit || {};
  } catch { return {}; }
}

function decideCommitMessage(command, policy, branch) {
  const bad = checkCommitMessage(extractCommitMessage(command), policy !== undefined ? policy : commitPolicy(), branch);
  if (!bad) return null;
  // A missing ticket is the human's call (the agent can't conjure one) → ASK, overridable per commit, tagged
  // so the existing `wall` event records why. A malformed message is the agent's to fix → DENY + self-correct.
  if (bad.kind === 'ticket') return { action: 'ask', why: 'no_ticket', reason: `health-harness wall — ${bad.reason}` };
  return { action: 'deny', reason: `health-harness wall — commit blocked: ${bad.reason}` };
}

// ── gate-evidence gate → ASK if shipping without a real passing gate ──────────
// Deterministic anti-hallucination: at push time, require a REAL captured passing gate run for HEAD. A
// claimed-but-unproven "it's green" has no fingerprint → ASK (conscious approve to ship unverified). NOT
// suppressed by the ship grant — it's a distinct safety question, not the routine outward approval.
const PUBLISH_RE = /\bgit\s+push\b/i;

function decideGateEvidence(command, cwd, stateOverride) {
  if (!PUBLISH_RE.test(String(command || ''))) return null;
  let st = stateOverride;
  if (!st) { try { st = require('../bin/gate-evidence.js').currentState(cwd || process.cwd()); } catch { return null; } }
  if (!st || st.state === 'verified') return null; // real passing gate for this commit → no extra prompt
  if (st.state === 'no-gate') return { action: 'ask', reason: 'health-harness wall: no automated gate in this repo — this push is UNVERIFIED. Establish a gate (characterization tests) or approve to ship unverified.' };
  return { action: 'ask', reason: `health-harness wall: no captured PASSING gate run for this commit (${String(st.sha).slice(0, 12)}) — run the gate green first, or approve to ship unverified. (Blocks a hallucinated "it's green".)` };
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

// ── redaction egress gate → DENY (PHI/PII/secrets must not leave) ──────────────
// Backstop for the literal-PHI vector: scan the OUTBOUND content of a text egress (gh pr/issue body, MCP
// Jira/Linear writes) with the deterministic profile-driven scanner. A hit → DENY (the agent redacts to
// synthetic + retries; a confirmed false positive is allow-listed once in compliance.json). Scanner error →
// fail-CLOSED to ASK (never silently allow; never brick shipping). NOTE: this catches PHI *literals* in the
// payload — not code that LOGS PHI at runtime (that's safe-logging, enforced as project TDD tests).
const TEXT_EGRESS_RE = /\bgh\s+(pr|issue|release|gist)\b|--body\b|--body-file\b|--notes(-file)?\b/i;

function redactionHits(text, cwd) {
  try {
    const rs = require('../bin/redaction-scan.js');
    const cfg = rs.loadConfig(cwd || process.cwd()); // { profile, classes, allow, deny } — hipaa default
    return rs.scanText(String(text || ''), { classes: cfg.classes, allow: cfg.allow, deny: cfg.deny });
  } catch { return null; } // scanner unavailable/threw → couldn't verify
}

// Pull --body-file / --notes-file / -F referenced file contents into the scannable text (best-effort).
function expandFileRefs(command, cwd) {
  let extra = '';
  try {
    const fs = require('fs'), path = require('path');
    const re = /(?:--body-file|--notes-file|-F)[=\s]+(['"]?)([^'"\s]+)\1/g;
    let m;
    while ((m = re.exec(String(command || '')))) {
      try { extra += '\n' + fs.readFileSync(path.resolve(cwd || process.cwd(), m[2]), 'utf8'); } catch { /* unreadable → skip */ }
    }
  } catch { /* ignore */ }
  return extra;
}

function redactionDecision(hits) {
  if (hits === null) return { action: 'ask', reason: 'health-harness wall: could not verify redaction (scanner error) — review the content for PHI/PII/secrets, then approve.' };
  if (hits.length) {
    const classes = [...new Set(hits.map((h) => h.class))].join(', ');
    return { action: 'deny', reason: `health-harness wall — send blocked: redaction found ${classes} (${hits.length} hit${hits.length > 1 ? 's' : ''}) in the outbound content. Run /phi-redaction-check for locations; replace with synthetic data and retry, or allow-list a confirmed false positive in compliance.json.` };
  }
  return null;
}

function decideRedactionBash(command, cwd) {
  const cmd = String(command || '');
  if (!TEXT_EGRESS_RE.test(cmd)) return null; // only scan text-egress commands (perf + fewer false positives)
  return redactionDecision(redactionHits(cmd + expandFileRefs(cmd, cwd), cwd));
}

function decideRedactionMcp(tool, toolInput, cwd) {
  if (!MCP_WRITE.test(String(tool || ''))) return null; // reads carry no outbound content
  return redactionDecision(redactionHits(JSON.stringify(toolInput || {}), cwd));
}

function decide(toolName, toolInput, gitState, shipGrant) {
  try {
    const cwd = process.cwd();
    // A live ship grant means the user already approved this publish batch on /ship's verbatim preview — so
    // we DON'T re-ASK on the individual outward steps. It NEVER suppresses DENY (catastrophic + redaction).
    const granted = shipGrant !== undefined ? shipGrant : require('../bin/ship-grant.js').isShipGrantActive(cwd);
    const dropAsk = (d) => (granted && d && d.action === 'ask' ? null : d); // grant downgrades ASK→defer
    if (toolName === 'Bash') {
      const cmd = (toolInput || {}).command;
      const red = decideRedactionBash(cmd, cwd); // PHI → DENY/ASK, NEVER suppressed by a grant
      if (red) return red;
      const bash = decideBash(cmd);
      if (bash && bash.action === 'deny') return bash; // catastrophic DENY (force-push, rm -rf …) beats all below
      const gate = decideGateEvidence(cmd, cwd);       // ship-without-passing-gate → ASK, NOT grant-suppressed
      if (gate) return gate;
      const gs = gitState !== undefined ? gitState : gitProbe();
      return dropAsk(bash)                             // outward ASK suppressed under a grant
        || decideCommitGuard(cmd, gs)                  // commit guards: not part of the batch
        || decideCommitMessage(cmd, undefined, gs && gs.branch); // no-ticket ASK uses the branch to resolve a key
    }
    if (String(toolName).startsWith('mcp__')) {
      const red = decideRedactionMcp(toolName, toolInput, cwd); // PHI → DENY, NEVER suppressed
      if (red) return red;
      return dropAsk(decideMcp(toolName));       // Jira/Linear write ASK suppressed under an active grant
    }
  } catch { /* fail-safe: defer */ }
  return null;
}

module.exports = { decide, decideBash, decideMcp, decideCommitGuard, decideCommitMessage, extractCommitMessage, checkCommitMessage, decideRedactionBash, decideRedactionMcp, decideGateEvidence, gitProbe, baseBranches };

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
      try { // metadata-only usage log of the governance decision (best-effort)
        const why = d.why || String(d.reason || '').replace(/^health-harness wall[^:—]*[:—]\s*/i, '').replace(/^blocked:\s*/i, '').slice(0, 40);
        require('../bin/usage-log.js').appendEvent('wall', { action: d.action, why });
      } catch { /* never block on logging */ }
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

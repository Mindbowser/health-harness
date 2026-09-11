'use strict';
/**
 * The HOOK ENTRY, exercised as a real process (MBI-159).
 *
 * Every other wall test calls decide() directly. That left the actual production path — stdin JSON in,
 * hookSpecificOutput JSON out — with no coverage at all, and it shipped inert: a ReferenceError inside the
 * entry's try/catch made EVERY decision silently return "defer", disabling the whole wall. Unit-testing the
 * decision core is not the same as testing the thing Claude Code actually runs.
 */
const { test } = require('node:test');
const assert = require('node:assert');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const HOOK = path.join(__dirname, '..', 'hooks', 'outward-guard.js');

/** Run the hook exactly as the harness does: JSON on stdin → JSON (or empty = defer) on stdout. */
function runHook(toolName, toolInput, cwd) {
  const out = execFileSync('node', [HOOK], {
    input: JSON.stringify({ tool_name: toolName, tool_input: toolInput }),
    cwd, encoding: 'utf8',
  });
  if (!out.trim()) return null; // no output = defer
  return JSON.parse(out).hookSpecificOutput;
}

/** A throwaway git repo so the entry's real git shell-outs have something to read. */
function scratchRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-entry-'));
  const git = (args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' });
  git(['init', '-q', '-b', 'main']);
  git(['config', 'user.email', 'dev@acme.test']);
  git(['config', 'user.name', 'Dev']);
  fs.writeFileSync(path.join(dir, 'app.js'), 'const a = 1;\n');
  git(['add', '-A']);
  git(['commit', '-qm', 'chore: init']);
  return dir;
}

test('MBI-159: the hook entry emits a decision — it is not inert', () => {
  const dir = scratchRepo();
  const d = runHook('Bash', { command: 'git push origin main' }, dir);
  assert.ok(d, 'the hook MUST produce a decision for an outward command (inert wall = the MBI-159 bug)');
  assert.ok(['ask', 'deny'].includes(d.permissionDecision));
  assert.strictEqual(d.hookEventName, 'PreToolUse');
  assert.ok(d.permissionDecisionReason && d.permissionDecisionReason.length > 0);
});

test('MBI-159: the entry still DENIES a catastrophic command', () => {
  const dir = scratchRepo();
  const d = runHook('Bash', { command: 'git push --force origin main' }, dir);
  assert.ok(d);
  assert.strictEqual(d.permissionDecision, 'deny');
});

test('MBI-159: the entry defers on a read-only command (no prompt noise)', () => {
  const dir = scratchRepo();
  assert.strictEqual(runHook('Bash', { command: 'git status' }, dir), null);
  assert.strictEqual(runHook('Read', { file_path: '/tmp/x' }, dir), null);
});

test('MBI-159: the entry blocks a commit that introduces a secret, and names the allowlist escape', () => {
  const dir = scratchRepo();
  // stage a NEW line carrying a synthetic AWS example key
  fs.appendFileSync(path.join(dir, 'app.js'), `const k = "${'AKIA' + 'IOSFODNN7EXAMPLE'}";\n`);
  execFileSync('git', ['add', '-A'], { cwd: dir, stdio: 'ignore' });
  const d = runHook('Bash', { command: 'git commit -m "feat: add key"' }, dir);
  assert.ok(d, 'a staged secret must produce a decision');
  assert.strictEqual(d.permissionDecision, 'deny');
  assert.match(d.permissionDecisionReason, /secrets/);
  assert.match(d.permissionDecisionReason, /harness-allowlist/);
});

test('MBI-159: the entry survives malformed stdin without crashing (fail-safe defer)', () => {
  const dir = scratchRepo();
  const out = execFileSync('node', [HOOK], { input: 'not json at all', cwd: dir, encoding: 'utf8' });
  assert.strictEqual(out.trim(), '', 'unparseable input must defer, never crash the tool flow');
});

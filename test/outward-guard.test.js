'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { decide, decideBash, decideMcp, decideCommitGuard, decideCommitMessage, extractCommitMessage, checkCommitMessage } = require('../hooks/outward-guard.js');

const action = (d) => (d ? d.action : null);

test('extractCommitMessage: pulls the -m subject across quoting styles; defers editor/-F', () => {
  assert.strictEqual(extractCommitMessage('git commit -m "feat: x"'), 'feat: x');
  assert.strictEqual(extractCommitMessage("git commit -am 'fix: y'"), 'fix: y');
  assert.strictEqual(extractCommitMessage('git commit --message="docs: z"'), 'docs: z');
  assert.strictEqual(extractCommitMessage('git commit'), null);           // editor → can't see → defer
  assert.strictEqual(extractCommitMessage('git commit -F msg.txt'), null); // -F → defer
  assert.strictEqual(extractCommitMessage('npm test'), null);             // not a commit
});

test('checkCommitMessage: conventional enforced by default; non-conventional flagged; ticket opt-in', () => {
  assert.strictEqual(checkCommitMessage('feat(api): add thing', {}), null);     // valid → ok
  assert.strictEqual(checkCommitMessage('fix!: breaking', {}), null);           // bang allowed
  assert.ok(checkCommitMessage('added a thing', {}).reason.includes('conventional')); // no type → blocked
  assert.strictEqual(checkCommitMessage('whatever', { conventional: false }), null);  // disabled → ok
  assert.strictEqual(checkCommitMessage('feat: x', {}), null);                  // ticket off by default
  assert.ok(checkCommitMessage('feat: x', { requireTicket: true }).reason.includes('ticket'));
  assert.strictEqual(checkCommitMessage('feat: x (ABC-12)', { requireTicket: true }), null);
});

test('decideCommitMessage: DENY (agent self-corrects) on a malformed message; ok message defers', () => {
  assert.strictEqual(action(decideCommitMessage('git commit -m "nope no type"', {})), 'deny');
  assert.strictEqual(decideCommitMessage('git commit -m "feat: ok"', {}), null);
  assert.strictEqual(decideCommitMessage('git commit', {}), null); // editor commit → defer, never block
});

test('DENY catastrophic / irreversible', () => {
  assert.strictEqual(action(decideBash('rm -rf /')), 'deny');
  assert.strictEqual(action(decideBash('rm -rf ~')), 'deny');
  assert.strictEqual(action(decideBash('git push origin main --force')), 'deny');
  assert.strictEqual(action(decideBash('git push -f origin hotfix')), 'deny');
  assert.strictEqual(action(decideBash('psql -c "DROP TABLE patients"')), 'deny');
});

test('ASK outward / mutating (user approves)', () => {
  assert.strictEqual(action(decideBash('git push origin feature/x')), 'ask');
  assert.strictEqual(action(decideBash('gh pr create --base dev')), 'ask');
  assert.strictEqual(action(decideBash('rm -rf node_modules')), 'ask');   // destructive but not catastrophic
  assert.strictEqual(action(decideBash('git reset --hard HEAD~1')), 'ask');
  assert.strictEqual(action(decideBash('npm publish')), 'ask');
  assert.strictEqual(action(decideBash('aws s3 rm s3://bucket --recursive')), 'ask');
});

test('DEFER normal local work (no decision)', () => {
  assert.strictEqual(decideBash('npm test'), null);
  assert.strictEqual(decideBash('git commit -m "wip"'), null);
  assert.strictEqual(decideBash('git switch -c fix/ACME-123'), null);
  assert.strictEqual(decideBash('node bin/redaction-scan.js --staged'), null);
  assert.strictEqual(decideBash('ls -la'), null);
});

test('MCP writes ASK, reads DEFER', () => {
  assert.strictEqual(action(decideMcp('mcp__atlassian__createJiraIssue')), 'ask');
  assert.strictEqual(action(decideMcp('mcp__atlassian__editJiraIssue')), 'ask');
  assert.strictEqual(action(decideMcp('mcp__atlassian__transitionJiraIssue')), 'ask');
  assert.strictEqual(action(decideMcp('mcp__atlassian__addCommentToJiraIssue')), 'ask');
  assert.strictEqual(decideMcp('mcp__atlassian__getJiraIssue'), null);
  assert.strictEqual(decideMcp('mcp__atlassian__searchJiraIssuesUsingJql'), null);
});

test('commit on a base branch ASKs; feature branch / initial commit defer', () => {
  const onMain = { hasHistory: true, branch: 'main', bases: ['main', 'master'] };
  const onMaster = { hasHistory: true, branch: 'master', bases: ['main', 'master'] };
  const onDev = { hasHistory: true, branch: 'dev', bases: ['main', 'master', 'dev'] };  // configured baseBranch
  const onFeature = { hasHistory: true, branch: 'fix/ACME-123', bases: ['main', 'master', 'dev'] };
  // base branches → ASK
  assert.strictEqual(action(decideCommitGuard('git commit -m "wip"', onMain)), 'ask');
  assert.strictEqual(action(decideCommitGuard('git commit --amend', onMaster)), 'ask');
  assert.strictEqual(action(decideCommitGuard('git commit -m x', onDev)), 'ask');
  // feature branch → defer
  assert.strictEqual(decideCommitGuard('git commit -m x', onFeature), null);
  // initial commit (no history) → defer
  assert.strictEqual(decideCommitGuard('git commit -m init', { hasHistory: false }), null);
  // unknown git state → defer
  assert.strictEqual(decideCommitGuard('git commit -m x', null), null);
  // non-commit command → defer even on a base branch
  assert.strictEqual(decideCommitGuard('git status', onMain), null);
  // wired through decide() with injected state
  assert.strictEqual(action(decide('Bash', { command: 'git commit -m x' }, onMain)), 'ask');
  assert.strictEqual(decide('Bash', { command: 'git commit -m x' }, onFeature), null);
});

test('decide() routes by tool_name; unknown tools defer', () => {
  assert.strictEqual(action(decide('Bash', { command: 'git push' })), 'ask');
  assert.strictEqual(action(decide('mcp__atlassian__createJiraIssue', {})), 'ask');
  assert.strictEqual(decide('Read', { file_path: '/x' }), null);
  assert.strictEqual(decide('Edit', {}), null);
});

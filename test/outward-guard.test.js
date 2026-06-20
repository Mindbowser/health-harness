'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { decide, decideBash, decideMcp } = require('../hooks/outward-guard.js');

const action = (d) => (d ? d.action : null);

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

test('decide() routes by tool_name; unknown tools defer', () => {
  assert.strictEqual(action(decide('Bash', { command: 'git push' })), 'ask');
  assert.strictEqual(action(decide('mcp__atlassian__createJiraIssue', {})), 'ask');
  assert.strictEqual(decide('Read', { file_path: '/x' }), null);
  assert.strictEqual(decide('Edit', {}), null);
});

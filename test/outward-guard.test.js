'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { decide, decideBash, decideMcp, decideCommitGuard, decideCommitMessage, extractCommitMessage, checkCommitMessage, decideRedactionBash, decideRedactionMcp, decideCriteriaCoverage, decideCriteriaDetect } = require('../hooks/outward-guard.js');

const action = (d) => (d ? d.action : null);

test('decideCriteriaCoverage: uncovered acceptance criterion DENIES the push; defer→ask; covered/no-manifest→defer', () => {
  const push = 'git push origin HEAD';
  // an authored criterion with no test → DENY, citing the specific [AC-N]
  const deny = decideCriteriaCoverage(push, '.', { hasManifest: true, issueKey: 'MBI-61', cov: { covered: ['AC-1'], uncovered: ['AC-2'], deferred: [], ok: false } });
  assert.strictEqual(action(deny), 'deny');
  assert.match(deny.reason, /AC-2/);
  // a criterion explicitly deferred (recorded escape) → ASK, not DENY
  assert.strictEqual(action(decideCriteriaCoverage(push, '.', { hasManifest: true, cov: { covered: ['AC-1'], uncovered: [], deferred: ['AC-2'], ok: true } })), 'ask');
  // all criteria covered → defer (no decision)
  assert.strictEqual(decideCriteriaCoverage(push, '.', { hasManifest: true, cov: { covered: ['AC-1', 'AC-2'], uncovered: [], deferred: [], ok: true } }), null);
  // no manifest → defer (AC-6 opt-in: the feature is dormant until /align authors one)
  assert.strictEqual(decideCriteriaCoverage(push, '.', { hasManifest: false }), null);
  // not a push → defer
  assert.strictEqual(decideCriteriaCoverage('git status', '.', { hasManifest: true, cov: { covered: [], uncovered: ['AC-2'], deferred: [], ok: false } }), null);
});

test('decideCriteriaDetect (audit): hipaa + PHI added + no audit criterion → ASK; audit authored or non-hipaa → defer', () => {
  const push = 'git push origin HEAD';
  // PHI access added on a hipaa repo, no kind:audit criterion authored → ASK backstop
  assert.strictEqual(action(decideCriteriaDetect(push, '.', { profile: 'hipaa', phi: ['patient'], kinds: [] })), 'ask');
  // an audit criterion IS authored → the deterministic criterion path covers it; no extra ASK
  assert.strictEqual(decideCriteriaDetect(push, '.', { profile: 'hipaa', phi: ['patient'], kinds: ['audit'] }), null);
  // non-hipaa profile → PHI gate does not apply
  assert.strictEqual(decideCriteriaDetect(push, '.', { profile: 'none', phi: ['patient'], kinds: [] }), null);
  // no PHI signals on the diff → nothing to gate
  assert.strictEqual(decideCriteriaDetect(push, '.', { profile: 'hipaa', phi: [], kinds: [] }), null);
  // not a push → defer
  assert.strictEqual(decideCriteriaDetect('git status', '.', { profile: 'hipaa', phi: ['patient'], kinds: [] }), null);
});

test('criterion-coverage is NOT suppressed by a ship grant (decided before dropAsk, like gate-evidence)', () => {
  // granted (shipGrant=true) still DENIES an uncovered criterion
  const uncovered = { hasManifest: true, cov: { covered: ['AC-1'], uncovered: ['AC-2'], deferred: [], ok: false } };
  assert.strictEqual(action(decide('Bash', { command: 'git push' }, undefined, true, uncovered)), 'deny');
  // and a deferred criterion still ASKS under a grant
  const deferred = { hasManifest: true, cov: { covered: ['AC-1'], uncovered: [], deferred: ['AC-2'], ok: true } };
  assert.strictEqual(action(decide('Bash', { command: 'git push' }, undefined, true, deferred)), 'ask');
});

test('redaction egress gate: PHI in an outbound payload → DENY; clean → defer; reads not scanned', () => {
  // a Jira/Linear MCP WRITE carrying PHI is hard-blocked (before the outward ASK)
  const phiWrite = decideRedactionMcp('mcp__atlassian__addCommentToJiraIssue', { commentBody: 'patient MRN: 558231 still failing' });
  assert.strictEqual(action(phiWrite), 'deny');
  assert.ok(/redaction found/.test(phiWrite.reason) && !/558231/.test(phiWrite.reason)); // names the class, NOT the PHI value
  // a clean write → no redaction decision (falls through to the normal outward ASK)
  assert.strictEqual(decideRedactionMcp('mcp__atlassian__addCommentToJiraIssue', { commentBody: 'criteria met; see PR #42' }), null);
  // a READ MCP carries no outbound content → never scanned
  assert.strictEqual(decideRedactionMcp('mcp__atlassian__getJiraIssue', { issueKey: 'ABC-1' }), null);

  // gh pr body with a secret → DENY; clean body → defer; non-egress command → not scanned
  assert.strictEqual(action(decideRedactionBash('gh pr create --title x --body "key AKIA1234567890ABCD99"')), 'deny');
  assert.strictEqual(decideRedactionBash('gh pr create --body "feat: clean summary"'), null);
  assert.strictEqual(decideRedactionBash('npm test'), null);
});

test('redaction gate wins over the outward ASK (decide routes PHI write to deny, clean write to ask)', () => {
  assert.strictEqual(action(decide('mcp__atlassian__createJiraIssue', { fields: { description: 'DOB: 1980-04-02' } })), 'deny');
  assert.strictEqual(action(decide('mcp__atlassian__createJiraIssue', { fields: { description: 'synthetic ticket' } })), 'ask');
});

test('ship grant suppresses the outward ASK (one approval covers the batch) but NEVER DENY/redaction', () => {
  // clean outward write: no grant → ASK; active grant → defer (no re-prompt)
  assert.strictEqual(action(decide('mcp__atlassian__addCommentToJiraIssue', { commentBody: 'PR #42 up' }, undefined, false)), 'ask');
  assert.strictEqual(decide('mcp__atlassian__addCommentToJiraIssue', { commentBody: 'PR #42 up' }, undefined, true), null);
  // gh pr create (outward ASK, NOT gate-gated) under a grant → defer; without → ASK
  assert.strictEqual(action(decide('Bash', { command: 'gh pr create --title x --body "clean summary"' }, undefined, false)), 'ask');
  assert.strictEqual(decide('Bash', { command: 'gh pr create --title x --body "clean summary"' }, undefined, true), null);
  // a grant must NOT let PHI through, nor catastrophic commands
  assert.strictEqual(action(decide('mcp__atlassian__addCommentToJiraIssue', { commentBody: 'MRN: 7781' }, undefined, true)), 'deny');
  assert.strictEqual(action(decide('Bash', { command: 'git push --force origin main' }, undefined, true)), 'deny');
});

test('extractCommitMessage: pulls the -m subject across quoting styles; defers editor/-F', () => {
  assert.strictEqual(extractCommitMessage('git commit -m "feat: x"'), 'feat: x');
  assert.strictEqual(extractCommitMessage("git commit -am 'fix: y'"), 'fix: y');
  assert.strictEqual(extractCommitMessage('git commit --message="docs: z"'), 'docs: z');
  assert.strictEqual(extractCommitMessage('git commit'), null);           // editor → can't see → defer
  assert.strictEqual(extractCommitMessage('git commit -F msg.txt'), null); // -F → defer
  assert.strictEqual(extractCommitMessage('npm test'), null);             // not a commit
});

test('checkCommitMessage: conventional format enforced by default (ticket isolated via requireTicket:false)', () => {
  const fmt = { requireTicket: false }; // isolate the conventional-format check from the ticket check
  assert.strictEqual(checkCommitMessage('feat(api): add thing', fmt), null);     // valid → ok
  assert.strictEqual(checkCommitMessage('fix!: breaking', fmt), null);           // bang allowed
  assert.ok(checkCommitMessage('added a thing', fmt).reason.includes('conventional')); // no type → blocked
  assert.strictEqual(checkCommitMessage('whatever', { conventional: false, requireTicket: false }), null); // both off → ok
});

test('decideCommitMessage: DENY (agent self-corrects) on a malformed message; ok message defers', () => {
  assert.strictEqual(action(decideCommitMessage('git commit -m "nope no type"', {})), 'deny');
  assert.strictEqual(decideCommitMessage('git commit -m "feat: ok ABC-1"', {}), null); // conventional + ticket → ok
  assert.strictEqual(decideCommitMessage('git commit', {}), null); // editor commit → defer, never block
});

test('checkCommitMessage: requireTicket is ON by default; satisfied by branch OR message; kind discriminates', () => {
  // default ON now: a conventional message with NO ticket anywhere → kind 'ticket'
  assert.strictEqual(checkCommitMessage('feat: x', {}, '').kind, 'ticket');
  // ticket in the MESSAGE satisfies it
  assert.strictEqual(checkCommitMessage('feat: x ABC-12', {}, ''), null);
  // ticket on the BRANCH satisfies it even if absent from the message
  assert.strictEqual(checkCommitMessage('feat: x', {}, 'feature/ABC-12-foo'), null);
  // explicit opt-out
  assert.strictEqual(checkCommitMessage('feat: x', { requireTicket: false }, ''), null);
  // a format violation is kind 'format' and takes precedence (the agent self-corrects it)
  assert.strictEqual(checkCommitMessage('no type here', {}, '').kind, 'format');
});

test('decideCommitMessage: format → DENY (self-correct); missing ticket → ASK with why=no_ticket (overridable per commit)', () => {
  assert.strictEqual(decideCommitMessage('git commit -m "nope no type"', {}, '').action, 'deny');
  const noTicket = decideCommitMessage('git commit -m "feat: x"', {}, ''); // default ON, no branch key
  assert.strictEqual(noTicket.action, 'ask');                              // ASK not DENY — agent can't invent a ticket
  assert.strictEqual(noTicket.why, 'no_ticket');                          // tags the existing wall event
  assert.strictEqual(decideCommitMessage('git commit -m "feat: x"', {}, 'feature/ABC-12-foo'), null); // branch key → silent
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

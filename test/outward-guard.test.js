'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { decide, decideBash, decideMcp, decideCommitGuard, decidePushGuard, decideDiffScan, augmentPushAsk, decidePreCommitChecks, decideCommitReview, decideCommitMessage, extractCommitMessage, checkCommitMessage, checkBranchName, decideBranchName, decideRedactionBash, decideRedactionMcp, decideCriteriaCoverage, decideCriteriaDetect, decideBoundary, decideOpenQuestions, wallAutoApprove, commitPolicy, baseBranches, findConfigPath } = require('../hooks/outward-guard.js');

// ── MBI-144: branch-name enforcement (opt-in; recommend-only by default) ──
test('checkBranchName: dormant unless git.enforceBranch is set', () => {
  assert.strictEqual(checkBranchName('git checkout -b whatever', {}), null);            // no policy → recommend-only
  assert.strictEqual(checkBranchName('git checkout -b whatever', { enforceBranch: false }), null);
});

test('checkBranchName: enforce blocks a non-conforming create, allows prefix/KEY-slug', () => {
  const pol = { enforceBranch: true, branchPattern: 'feature/<KEY>-<slug>' };
  assert.strictEqual(checkBranchName('git checkout -b add-login', pol) === null, false); // no prefix/key → blocked
  assert.ok(checkBranchName('git checkout -b add-login', pol).reason.includes('convention'));
  assert.strictEqual(checkBranchName('git checkout -b feature/ABC-12-add-login', pol), null); // conforms
  assert.strictEqual(checkBranchName('git switch -c bugfix/ABC-13-fix', pol), null);          // switch -c too
  assert.strictEqual(checkBranchName('git status', pol), null);                               // not a create
});

test('decideBranchName: enforce → DENY with gate=branchName', () => {
  const pol = { enforceBranch: true };
  const d = decideBranchName('git checkout -b nope', pol);
  assert.strictEqual(d.action, 'deny');
  assert.strictEqual(d.gate, 'branchName');
  assert.strictEqual(decideBranchName('git checkout -b feature/ABC-1-x', pol), null);
});

// ── MBI-134: open-questions push gate (ASK to ratify unresolved guesses before ship) ──
test('decideOpenQuestions: push with an open question ASKs (openQuestions gate); resolved/none/non-push defer', () => {
  const oq = require('../bin/open-questions.js');
  const open = oq.addQuestion(oq.emptyLedger('COH-1'), { ac: 'AC-1', question: 'case-sensitive?', recommendation: 'ci' });
  // a push while a question is open → ASK, tagged for the openQuestions gate
  const d = decideOpenQuestions('git push origin HEAD', '.', open);
  assert.strictEqual(action(d), 'ask');
  assert.strictEqual(d.gate, 'openQuestions');
  assert.match(d.reason, /case-sensitive\?/);
  // resolved → no block
  assert.strictEqual(decideOpenQuestions('git push', '.', oq.resolveQuestion(open, 'Q-1', { answer: 'ci' })), null);
  // no open questions → no block
  assert.strictEqual(decideOpenQuestions('git push', '.', oq.emptyLedger('COH-1')), null);
  // not a push → defer even with an open question
  assert.strictEqual(decideOpenQuestions('git status', '.', open), null);
});

test('open-questions gate is auto-approvable via wall.autoApprove.openQuestions', () => {
  const oq = require('../bin/open-questions.js');
  const open = oq.addQuestion(oq.emptyLedger('COH-1'), { ac: 'AC-1', question: 'q?', recommendation: 'r' });
  // ASKs by default (shipGrant=true drops the /ship push-redirect ASK, isolating the openQuestions gate;
  // openQuestions is intentionally NOT grant-suppressed, like gate-evidence)…
  assert.strictEqual(action(decide('Bash', { command: 'git push' }, { branch: 'feature/COH-1-x' }, true, { hasManifest: false }, { profile: 'none', phi: [], logging: false, datetime: false, kinds: [] }, { state: 'verified' }, {}, undefined, open)), 'ask');
  // …silenced when the gate is auto-approved
  assert.strictEqual(decide('Bash', { command: 'git push' }, { branch: 'feature/COH-1-x' }, true, { hasManifest: false }, { profile: 'none', phi: [], logging: false, datetime: false, kinds: [] }, { state: 'verified' }, { openQuestions: true }, undefined, open), null);
});

// ── MBI-124: module-boundary guard (ASK before an out-of-bounds edit / mutating bash) ──
test('decideBoundary: out-of-bounds edit ASKs (boundary gate); in-bounds + dormant defer', () => {
  const bounds = { root: '/repo', boundaries: ['src/router/**'] };
  // an Edit outside the declared boundary → ASK, tagged for the `boundary` gate, naming the path + the list
  const d = decideBoundary('Edit', { file_path: '/repo/src/service/db.js' }, '/repo', bounds);
  assert.strictEqual(action(d), 'ask');
  assert.strictEqual(d.gate, 'boundary');
  assert.match(d.reason, /src\/service\/db\.js/);
  assert.match(d.reason, /boundary list/i);
  // an Edit inside the boundary → defer (allowed)
  assert.strictEqual(decideBoundary('Edit', { file_path: '/repo/src/router/x.js' }, '/repo', bounds), null);
  // a mutating Bash outside the boundary → ASK
  assert.strictEqual(action(decideBoundary('Bash', { command: 'rm -rf /repo/src/service/old.js' }, '/repo', bounds)), 'ask');
  // dormant (no boundaries declared) → defer regardless (AC-3 opt-in)
  assert.strictEqual(decideBoundary('Edit', { file_path: '/repo/anything.js' }, '/repo', { root: '/repo', boundaries: [] }), null);
  // a read-only bash command touches nothing → defer
  assert.strictEqual(decideBoundary('Bash', { command: 'cat /repo/src/service/db.js' }, '/repo', bounds), null);
});

test('decideBoundary is auto-approvable via wall.autoApprove.boundary (suppressed to defer)', () => {
  const bounds = { root: '/repo', boundaries: ['src/router/**'] };
  // through decide(): out-of-bounds Edit ASKs by default…
  const asked = decide('Edit', { file_path: '/repo/src/service/db.js' }, undefined, false, { hasManifest: false }, { profile: 'none', phi: [], logging: false, datetime: false, kinds: [] }, { state: 'verified' }, {}, bounds);
  assert.strictEqual(action(asked), 'ask');
  // …and is silenced when the boundary gate is auto-approved
  const auto = decide('Edit', { file_path: '/repo/src/service/db.js' }, undefined, false, { hasManifest: false }, { profile: 'none', phi: [], logging: false, datetime: false, kinds: [] }, { state: 'verified' }, { boundary: true }, bounds);
  assert.strictEqual(auto, null);
});

const action = (d) => (d ? d.action : null);

// ── MBI-130: config resolution walks up to the repo root (subdir no longer silently loses the gate) ──
test('MBI-130: the wall config resolves from a subdirectory by walking up to the root', () => {
  const fs = require('fs'), path = require('path'), os = require('os');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-walkup-'));
  fs.mkdirSync(path.join(root, '.health-harness'), { recursive: true });
  fs.writeFileSync(path.join(root, '.health-harness', 'project.json'), JSON.stringify({
    wall: { autoApprove: { commit: false } },
    commit: { conventional: true, requireTicket: true },
    git: { baseBranch: 'develop' },
  }));
  const deep = path.join(root, 'services', 'api', 'src');
  fs.mkdirSync(deep, { recursive: true });

  // findConfigPath: locates the root manifest from a nested dir
  assert.equal(findConfigPath(deep), path.join(root, '.health-harness', 'project.json'));

  // all three readers resolve the ROOT config from the subdir (previously they returned defaults)
  assert.equal(wallAutoApprove(deep).commit, false, 'commit gate flag must resolve from subdir');
  assert.equal(commitPolicy(deep).requireTicket, true, 'commit policy must resolve from subdir');
  assert.ok(baseBranches(deep).includes('develop'), 'base branch must resolve from subdir');

  // no config anywhere up the tree → readers fall back to defaults, findConfigPath returns null (terminates)
  const orphan = fs.mkdtempSync(path.join(os.tmpdir(), 'hh-noconf-'));
  assert.equal(findConfigPath(orphan), null);
  assert.deepEqual(wallAutoApprove(orphan), {});
  assert.deepEqual(commitPolicy(orphan), {});
});

// Hermetic override args for decide() routing tests (MBI-72): gitState=undefined, shipGrant=false,
// covOverride=no-manifest, detectOverride=no-triggers, gateOverride=verified — so routing assertions don't
// depend on a live ship-grant / gate-evidence / branch diff. Spread after (toolName, toolInput).
// A NEUTRAL git state, not `undefined`. Passing undefined made decide() fall through to a live gitProbe(),
// so these tests silently depended on whichever branch the run happened to be standing on — green on a
// feature branch, red on main once branch protection landed (MBI-158). Every other injected override here
// is explicit for the same reason; git state must be too.
const NEUTRAL_GIT = { hasHistory: true, branch: 'feature/HERMETIC-1', bases: ['main', 'master'] };
const HERMETIC = [NEUTRAL_GIT, false, { hasManifest: false }, { profile: 'none', phi: [], logging: false, datetime: false, kinds: [] }, { state: 'verified' }];

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

test('decideCriteriaDetect (app-logging): logger introduced + no app-logging criterion → ASK', () => {
  const push = 'git push origin HEAD';
  assert.strictEqual(action(decideCriteriaDetect(push, '.', { logging: true, kinds: [] })), 'ask');
  // an app-logging criterion is authored → no extra ASK
  assert.strictEqual(decideCriteriaDetect(push, '.', { logging: true, kinds: ['app-logging'] }), null);
  // no logging introduced → nothing to gate
  assert.strictEqual(decideCriteriaDetect(push, '.', { logging: false, kinds: [] }), null);
});

test('decideCriteriaDetect: a recorded convention upgrades the audit/logging backstop from ASK to DENY', () => {
  const push = 'git push origin HEAD';
  // audit helper recorded in conventions → the project HAS a standard, so a missing audit criterion is DENY
  assert.strictEqual(action(decideCriteriaDetect(push, '.', { profile: 'hipaa', phi: ['patient'], kinds: [], conventions: { audit: { helper: 'src/lib/audit.record' } } })), 'deny');
  // logger module recorded → raw logging without the app-logging criterion is DENY
  assert.strictEqual(action(decideCriteriaDetect(push, '.', { logging: true, kinds: [], conventions: { logging: { module: 'src/lib/logger' } } })), 'deny');
  // no convention recorded → stays a heuristic ASK
  assert.strictEqual(action(decideCriteriaDetect(push, '.', { logging: true, kinds: [] })), 'ask');
});

test('decideCriteriaDetect (timezone): date/time API used with no marker/criterion → DENY; marker or criterion → defer', () => {
  const push = 'git push origin HEAD';
  assert.strictEqual(action(decideCriteriaDetect(push, '.', { datetime: true, tzMarker: false, kinds: [] })), 'deny');
  // an explicit // tz-safe marker → no block
  assert.strictEqual(decideCriteriaDetect(push, '.', { datetime: true, tzMarker: true, kinds: [] }), null);
  // a kind:timezone criterion authored → no block
  assert.strictEqual(decideCriteriaDetect(push, '.', { datetime: true, tzMarker: false, kinds: ['timezone'] }), null);
  // no date/time API used → nothing to gate
  assert.strictEqual(decideCriteriaDetect(push, '.', { datetime: false, tzMarker: false, kinds: [] }), null);
});

test('criterion-coverage is NOT suppressed by a ship grant (decided before dropAsk, like gate-evidence)', () => {
  // gateOverride 'verified' so gate-evidence (which also precedes dropAsk) doesn't mask the cov decision
  const verified = { state: 'verified' };
  // granted (shipGrant=true) still DENIES an uncovered criterion
  const uncovered = { hasManifest: true, cov: { covered: ['AC-1'], uncovered: ['AC-2'], deferred: [], ok: false } };
  assert.strictEqual(action(decide('Bash', { command: 'git push' }, undefined, true, uncovered, undefined, verified)), 'deny');
  // and a deferred criterion still ASKS under a grant
  const deferred = { hasManifest: true, cov: { covered: ['AC-1'], uncovered: [], deferred: ['AC-2'], ok: true } };
  assert.strictEqual(action(decide('Bash', { command: 'git push' }, undefined, true, deferred, undefined, verified)), 'ask');
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
  assert.strictEqual(action(decide('mcp__atlassian__createJiraIssue', { fields: { description: 'DOB: 1980-04-02' } }, ...HERMETIC)), 'deny');
  // clean tracker write: pass an explicit all-off auto-approve override, since trackerWrite is default-ON
  // (MBI-110) — this asserts the ASK path when NOT auto-approved. (Redaction still DENYs the PHI case above.)
  assert.strictEqual(action(decide('mcp__atlassian__createJiraIssue', { fields: { description: 'synthetic ticket' } }, ...HERMETIC, {})), 'ask');
});

test('ship grant suppresses the outward ASK (one approval covers the batch) but NEVER DENY/redaction', () => {
  // clean outward CONTENT write that still ASKs by default — use a NON-tracker MCP write (a GitHub MCP
  // create), since tracker writes now auto-approve by default (MBI-110) and comments defer (MBI-67):
  // no grant → ASK; grant → defer.
  assert.strictEqual(action(decide('mcp__github__create_issue', { title: 'x', body: 'PR #42 up' }, undefined, false)), 'ask');
  assert.strictEqual(decide('mcp__github__create_issue', { title: 'x', body: 'PR #42 up' }, undefined, true), null);
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

test('checkCommitMessage: commit.ticketFormat requires a commitlint-safe placement in the message (MBI-145)', () => {
  const footer = { ticketFormat: 'footer' };
  // a key in the subject does NOT satisfy footer format → kind 'ticket', suggestion names the carrier
  const miss = checkCommitMessage('feat: add thing ABC-12', footer, 'feature/ABC-12-x');
  assert.strictEqual(miss.kind, 'ticket');
  assert.ok(miss.reason.includes('Refs ABC-12'));                 // resolved key filled into the suggestion
  // proper footer satisfies it
  assert.strictEqual(checkCommitMessage('feat: add thing\n\nRefs ABC-12', footer, ''), null);
  // scope format
  assert.strictEqual(checkCommitMessage('feat(ABC-12): add', { ticketFormat: 'scope' }, ''), null);
  // default (no ticketFormat) is unchanged: branch key still satisfies
  assert.strictEqual(checkCommitMessage('feat: x', {}, 'feature/ABC-12-x'), null);
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

test('push/PR ASK redirects to /ship (MBI-69) — reason names the command; grant-suppressed inside /ship', () => {
  // AC-1: a raw push / PR points the user at /ship rather than just "outward"
  assert.match(decideBash('git push origin feature/x').reason, /\/ship/);
  assert.match(decideBash('gh pr create --base dev').reason, /\/ship/);
  // AC-2: inside /ship (active grant) the PR step stands down — no prompt (gate path aside)
  assert.strictEqual(decide('Bash', { command: 'gh pr create --title x --body "clean"' }, undefined, true), null);
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

test('MCP: content writes ASK, reversible ops (transition/comment/worklog) DEFER, reads DEFER (MBI-67)', () => {
  // content create/edit still ASKs (outward content)
  assert.strictEqual(action(decideMcp('mcp__atlassian__createJiraIssue')), 'ask');
  assert.strictEqual(action(decideMcp('mcp__atlassian__editJiraIssue')), 'ask');
  assert.strictEqual(action(decideMcp('mcp__atlassian__updateConfluencePage')), 'ask');
  // reversible / low-stakes writes now DEFER (no prompt) — MBI-67
  assert.strictEqual(decideMcp('mcp__atlassian__transitionJiraIssue'), null);
  assert.strictEqual(decideMcp('mcp__atlassian__addCommentToJiraIssue'), null);
  assert.strictEqual(decideMcp('mcp__atlassian__addWorklogToJiraIssue'), null);
  // reads DEFER (unchanged)
  assert.strictEqual(decideMcp('mcp__atlassian__getJiraIssue'), null);
  assert.strictEqual(decideMcp('mcp__atlassian__searchJiraIssuesUsingJql'), null);
});

test('MBI-151: commit on a protected branch is DENIED (locked); feature branch / initial commit defer', () => {
  const onMain = { hasHistory: true, branch: 'main', bases: ['main', 'master'] };
  const onMaster = { hasHistory: true, branch: 'master', bases: ['main', 'master'] };
  const onDev = { hasHistory: true, branch: 'dev', bases: ['main', 'master', 'dev'] };  // configured protected
  const onFeature = { hasHistory: true, branch: 'fix/ACME-123', bases: ['main', 'master', 'dev'] };
  // protected branches → DENY (locked, no override), with a create-a-branch remedy in the reason
  const d = decideCommitGuard('git commit -m "wip"', onMain);
  assert.strictEqual(action(d), 'deny');
  assert.match(d.reason, /feature branch/i);
  assert.strictEqual(action(decideCommitGuard('git commit --amend', onMaster)), 'deny');
  assert.strictEqual(action(decideCommitGuard('git commit -m x', onDev)), 'deny');
  // feature branch → defer
  assert.strictEqual(decideCommitGuard('git commit -m x', onFeature), null);
  // initial commit (no history) → defer
  assert.strictEqual(decideCommitGuard('git commit -m init', { hasHistory: false }), null);
  // unknown git state → defer
  assert.strictEqual(decideCommitGuard('git commit -m x', null), null);
  // non-commit command → defer even on a base branch
  assert.strictEqual(decideCommitGuard('git status', onMain), null);
  // wired through decide() with injected state. onMain → DENY from the locked branch-protection guard.
  // onFeature → the commit-review gate is auto-approved by default (AUTO_APPROVE_DEFAULTS.commit), so a
  // normal commit defers. Tuned only via wall.autoApprove.commit (MBI-118) — see wall-autoapprove.test.js.
  assert.strictEqual(action(decide('Bash', { command: 'git commit -m x' }, onMain)), 'deny');
  assert.strictEqual(decide('Bash', { command: 'git commit -m x' }, onFeature), null);
});

test('MBI-151: decidePushGuard DENIES a direct push to a protected branch; feature-branch push defers', () => {
  const onFeature = { hasHistory: true, branch: 'feature/ACME-1', bases: ['main', 'master', 'release/*'] };
  const onMain = { hasHistory: true, branch: 'main', bases: ['main', 'master'] };
  // explicit protected destination → DENY
  assert.strictEqual(action(decidePushGuard('git push origin main', onFeature)), 'deny');
  assert.strictEqual(action(decidePushGuard('git push origin release/1.2', onFeature)), 'deny');
  // src:dst refspec pushing INTO a protected branch → DENY
  assert.strictEqual(action(decidePushGuard('git push origin feature/ACME-1:main', onFeature)), 'deny');
  // bare push while sitting on a protected branch → DENY
  assert.strictEqual(action(decidePushGuard('git push', onMain)), 'deny');
  // [AC-5] push of a feature branch (bare, HEAD, or explicit) → defer
  assert.strictEqual(decidePushGuard('git push origin HEAD', onFeature), null);
  assert.strictEqual(decidePushGuard('git push', onFeature), null);
  assert.strictEqual(decidePushGuard('git push -u origin feature/ACME-1', onFeature), null);
  // non-push / unknown state → defer
  assert.strictEqual(decidePushGuard('git status', onMain), null);
  assert.strictEqual(decidePushGuard('git push origin main', null), null);
});

test('decideCommitReview: a commit gets the commit-review ASK (gate:commit); non-commits defer', () => {
  const d = decideCommitReview('git commit -m "feat: x"');
  assert.strictEqual(action(d), 'ask');
  assert.strictEqual(d.gate, 'commit');            // suppression is via wall.autoApprove.commit, not a policy arg
  assert.strictEqual(decideCommitReview('git status'), null); // not a commit → defer
  assert.strictEqual(decideCommitReview('echo hi'), null);
});

test('decide() routes by tool_name; unknown tools defer', () => {
  assert.strictEqual(action(decide('Bash', { command: 'git push' }, ...HERMETIC)), 'ask');
  assert.strictEqual(action(decide('mcp__atlassian__createJiraIssue', {}, ...HERMETIC, {})), 'ask'); // {} = all-off override (trackerWrite is default-ON)
  assert.strictEqual(decide('Read', { file_path: '/x' }, ...HERMETIC), null);
  assert.strictEqual(decide('Edit', {}, ...HERMETIC), null);
});

// ── MBI-152: diff-scoped secret/PHI scan on commit/push (locked; escape = harness-allowlist) ──
test('MBI-152: decideDiffScan DENIES a commit/push whose ADDED diff introduces a secret; clean/absent defer', () => {
  const SECRET = 'AKIA' + 'IOSFODNN7EXAMPLE';
  const withSecret = ['+++ b/config.js', '@@ -0,0 +1 @@', '+const k = "' + SECRET + '";'].join('\n');
  const clean = ['+++ b/config.js', '@@ -0,0 +1 @@', '+const k = 1;'].join('\n');
  // [AC-1] commit introducing a secret → DENY, naming the class and the allowlist escape
  const d = decideDiffScan('git commit -m x', '.', withSecret);
  assert.strictEqual(action(d), 'deny');
  assert.match(d.reason, /secrets/);
  assert.match(d.reason, /harness-allowlist/);
  // [AC-5] push introducing a secret → DENY; a clean diff defers
  assert.strictEqual(action(decideDiffScan('git push', '.', withSecret)), 'deny');
  assert.strictEqual(decideDiffScan('git push', '.', clean), null);
  assert.strictEqual(decideDiffScan('git commit -m x', '.', clean), null);
  // [AC-2] a secret only on a CONTEXT line (pre-existing, untouched) → defer
  const contextOnly = ['+++ b/config.js', '@@ -1,2 +1,2 @@', ' const k = "' + SECRET + '";', '+const b = 2;'].join('\n');
  assert.strictEqual(decideDiffScan('git commit -m x', '.', contextOnly), null);
  // not a commit/push, or no diff → defer
  assert.strictEqual(decideDiffScan('git status', '.', withSecret), null);
  assert.strictEqual(decideDiffScan('git commit -m x', '.', ''), null);
});



// ── MBI-154: configurable pre-commit checks (advisory ASK; quiet by default) ──
test('MBI-154: decidePreCommitChecks ASKs on findings; clean commit and non-commit defer', () => {
  const MARKER = '<'.repeat(7);
  const diff = ['+++ b/src/x.js', '@@ -1,1 +1,2 @@', ' const a = 1;', '+' + MARKER + ' HEAD'].join('\n');
  const base = { config: {}, files: [], subject: 'fix(x): y', diff };
  // a conflict marker on an added line → ASK listing the finding
  const d = decidePreCommitChecks('git commit -m "fix(x): y"', '.', base);
  assert.strictEqual(action(d), 'ask');
  assert.strictEqual(d.gate, 'preCommitChecks');
  assert.match(d.reason, /mergeConflictMarkers/);
  assert.match(d.reason, /src\/x\.js:2/);
  // clean diff → no prompt
  const clean = ['+++ b/src/x.js', '@@ -1,1 +1,2 @@', '+const b = 2;'].join('\n');
  assert.strictEqual(decidePreCommitChecks('git commit -m "fix(x): y"', '.', { ...base, diff: clean }), null);
  // an oversized staged file → ASK
  assert.strictEqual(action(decidePreCommitChecks('git commit -m x', '.', { ...base, diff: clean, files: [{ path: 'big.bin', bytes: 9 * 1048576 }] })), 'ask');
  // not a commit → defer
  assert.strictEqual(decidePreCommitChecks('git status', '.', base), null);
});

// ── MBI-157: branch protection is strict BY DEFAULT but overridable (deny | ask | off) ──
test('MBI-157: branchProtection level controls commit/push guards; default stays deny', () => {
  const onMain = { hasHistory: true, branch: 'main', bases: ['main', 'master'] };
  const onFeature = { hasHistory: true, branch: 'feature/x', bases: ['main', 'master'] };
  const commit = 'git commit -m x', push = 'git push origin main';
  // default (no level anywhere) → deny, as before
  assert.strictEqual(action(decideCommitGuard(commit, onMain)), 'deny');
  assert.strictEqual(action(decidePushGuard(push, onFeature)), 'deny');
  // 'ask' restores approve-to-override (the pre-MBI-151 behaviour) and says so
  const a = decideCommitGuard(commit, onMain, 'ask');
  assert.strictEqual(action(a), 'ask');
  assert.match(a.reason, /approve to commit/i);
  assert.strictEqual(action(decidePushGuard(push, onFeature, 'ask')), 'ask');
  // 'off' disables the guard entirely (a deliberately trunk-based repo)
  assert.strictEqual(decideCommitGuard(commit, onMain, 'off'), null);
  assert.strictEqual(decidePushGuard(push, onFeature, 'off'), null);
  // the level can ride on the probed git state instead of being passed explicitly
  assert.strictEqual(action(decideCommitGuard(commit, { ...onMain, protection: 'ask' })), 'ask');
  assert.strictEqual(decideCommitGuard(commit, { ...onMain, protection: 'off' }), null);
  // the deny message points at the override rather than leaving the dev stuck
  assert.match(decideCommitGuard(commit, onMain).reason, /branchProtection/);
  // a feature branch is untouched at every level
  for (const lvl of ['deny', 'ask', 'off']) assert.strictEqual(decideCommitGuard(commit, onFeature, lvl), null);
});

// ── MBI-158: decide() results must not depend on the branch the test run stands on ──
test('MBI-158: decide() takes injected git state, so the same command is branch-independent', () => {
  // The regression: HERMETIC passed `undefined` git state, so decide() fell through to a live gitProbe().
  // These tests were green on a feature branch and red on main once branch protection landed — the release
  // workflow (which runs on main) caught what every local run missed.
  const rest = HERMETIC.slice(1);
  const onProtected = { hasHistory: true, branch: 'main', bases: ['main', 'master'] };
  // injected protected branch → the push guard denies
  assert.strictEqual(action(decide('Bash', { command: 'git push' }, onProtected, ...rest)), 'deny');
  // injected feature branch → falls through to the ordinary outward push ASK
  assert.strictEqual(action(decide('Bash', { command: 'git push' }, ...HERMETIC)), 'ask');
  // the shared fixture must never go back to undefined (that is what made the result ambient)
  assert.notStrictEqual(HERMETIC[0], undefined, 'HERMETIC must inject git state, not leave it ambient');
  assert.ok(HERMETIC[0].branch);
});

// ── MBI-160: the diff summary is folded INTO the push ASK (not a separate, shadowed gate) ──
test('MBI-160: augmentPushAsk prepends the diff summary to the push ASK; interactive + has changes', () => {
  const pushAsk = { action: 'ask', gate: 'push', reason: 'pushing is a shipping step — run /ship or approve.' };
  const numstat = '10\t2\tsrc/app.js\n120\t0\tsrc/big.js';
  const shell = { PATH: '/usr/bin' };
  // [AC-1] interactive, enabled, has changes → reason now carries the summary, keeping the original text
  const out = augmentPushAsk(pushAsk, 'git push', '.', { enabled: true, env: shell, numstat });
  assert.strictEqual(out.action, 'ask');
  assert.match(out.reason, /What this push sends/);
  assert.match(out.reason, /src\/app\.js/);
  assert.match(out.reason, /2 files changed/);
  assert.match(out.reason, /shipping step/); // original push-ask text preserved
  // [AC-2] non-interactive → left exactly as-is (a summary is noise in CI)
  assert.strictEqual(augmentPushAsk(pushAsk, 'git push', '.', { enabled: true, env: { CI: 'true' }, numstat }), pushAsk);
  // toggle off → unchanged
  assert.strictEqual(augmentPushAsk(pushAsk, 'git push', '.', { enabled: false, env: shell, numstat }), pushAsk);
  // [AC-6] nothing to show → unchanged
  assert.strictEqual(augmentPushAsk(pushAsk, 'git push', '.', { enabled: true, env: shell, numstat: '' }), pushAsk);
  // only ever touches the push ASK — a DENY, a different gate, or null pass straight through
  const deny = { action: 'deny', gate: 'protectedPush', reason: 'x' };
  assert.strictEqual(augmentPushAsk(deny, 'git push', '.', { enabled: true, env: shell, numstat }), deny);
  const otherAsk = { action: 'ask', gate: 'commit', reason: 'x' };
  assert.strictEqual(augmentPushAsk(otherAsk, 'git commit', '.', { enabled: true, env: shell, numstat }), otherAsk);
  assert.strictEqual(augmentPushAsk(null, 'git push', '.', { enabled: true, env: shell, numstat }), null);
});

'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const {
  matchesGlob, pathInBoundaries, boundaryDecision, bashTargets, editTargets,
  recordBoundary, loadBoundaries, setBoundaries, isIgnored, checkToolCall,
} = require('../bin/boundary-check.js');

// Build a throwaway git repo on a ticket branch with a boundaries manifest; returns its root.
function tmpRepo(key, boundaries) {
  const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bc-repo-'));
  const run = (c) => cp.execSync(c, { cwd: root, stdio: ['ignore', 'pipe', 'ignore'] });
  run('git init -q'); run('git config user.email t@t.co'); run('git config user.name t');
  fs.mkdirSync(path.join(root, '.health-harness', 'criteria'), { recursive: true });
  fs.writeFileSync(path.join(root, '.health-harness', 'criteria', `${key}.json`),
    JSON.stringify({ issueKey: key, criteria: [], boundaries }, null, 2) + '\n');
  run('git add -A'); run('git commit -qm init'); run(`git checkout -q -b feature/${key}-slice`);
  return fs.realpathSync(root); // canonical (macOS /var → /private/var), matching git rev-parse --show-toplevel
}

test('[MBI-142] gitignored paths are exempt from the boundary guard (not part of the reviewable diff)', () => {
  const fs = require('fs'), path = require('path'), cp = require('child_process');
  const root = tmpRepo('MBI-142', ['src/router/**']);
  fs.writeFileSync(path.join(root, '.gitignore'), 'dist/\n*.log\ncoverage/\n');
  cp.execSync('git add .gitignore && git commit -qm ignore', { cwd: root, stdio: 'ignore' });

  // isIgnored: true for ignored paths, false for tracked/normal ones
  assert.equal(isIgnored(root, 'dist/out.js'), true);
  assert.equal(isIgnored(root, 'app.log'), true);
  assert.equal(isIgnored(root, 'config/app.json'), false);

  // checkToolCall: an out-of-bounds but GITIGNORED target → no decision (exempt)
  assert.equal(checkToolCall('Write', { file_path: path.join(root, 'dist/out.js') }, root), null);
  assert.equal(checkToolCall('Bash', { command: 'rm ' + path.join(root, 'debug.log') }, root), null);
  // an out-of-bounds TRACKED (non-ignored) target — even non-code — STILL flags
  const flagged = checkToolCall('Write', { file_path: path.join(root, 'config/app.json') }, root);
  assert.ok(flagged && flagged.out === true);

  // the living-list recorder does NOT add a gitignored file to the boundary list
  assert.equal(recordBoundary(root, path.join(root, 'dist/out.js')), false);
  assert.deepEqual(loadBoundaries(root).boundaries, ['src/router/**']); // unchanged
});

test('MBI-124: recordBoundary grows the living list on an approved out-of-bounds edit (idempotent, active only)', () => {
  const fs = require('fs'), path = require('path');
  const root = tmpRepo('MBI-999', ['src/router/**']);
  const read = () => JSON.parse(fs.readFileSync(path.join(root, '.health-harness', 'criteria', 'MBI-999.json'), 'utf8')).boundaries;

  // resolves the active ticket's boundaries from the branch
  assert.deepEqual(loadBoundaries(root).boundaries, ['src/router/**']);

  // an out-of-bounds path is promoted into the list
  assert.equal(recordBoundary(root, path.join(root, 'src/service/db.js')), true);
  assert.deepEqual(read(), ['src/router/**', 'src/service/db.js']);

  // idempotent: recording it again (now in-bounds) is a no-op
  assert.equal(recordBoundary(root, path.join(root, 'src/service/db.js')), false);
  assert.deepEqual(read(), ['src/router/**', 'src/service/db.js']);

  // an in-bounds path is never appended
  assert.equal(recordBoundary(root, path.join(root, 'src/router/x.js')), false);
});

test('MBI-124: setBoundaries declares globs on the manifest (creating it) and normalizes CSV input', () => {
  const fs = require('fs'), path = require('path');
  const root = tmpRepo('MBI-997', []);
  const p = path.join(root, '.health-harness', 'criteria', 'MBI-997.json');
  // accepts a CSV string, trims/filters, writes .boundaries, preserves the manifest shape
  const list = setBoundaries(root, 'MBI-997', ' src/router/** , , ui/nodered/** ');
  assert.deepEqual(list, ['src/router/**', 'ui/nodered/**']);
  assert.deepEqual(JSON.parse(fs.readFileSync(p, 'utf8')).boundaries, ['src/router/**', 'ui/nodered/**']);
  // and now the guard is active on that branch
  assert.deepEqual(loadBoundaries(root).boundaries, ['src/router/**', 'ui/nodered/**']);
});

test('MBI-124: recordBoundary never auto-populates a dormant ticket (empty boundaries stays empty)', () => {
  const fs = require('fs'), path = require('path');
  const root = tmpRepo('MBI-998', []); // dormant — nothing declared
  assert.equal(recordBoundary(root, path.join(root, 'anything.js')), false);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, '.health-harness', 'criteria', 'MBI-998.json'), 'utf8')).boundaries, []);
});

test('matchesGlob: ** spans path segments, * stays within one', () => {
  assert.ok(matchesGlob('src/router/index.js', 'src/router/**'));
  assert.ok(matchesGlob('src/router/a/b/c.js', 'src/router/**'));
  assert.ok(matchesGlob('src/router/index.js', 'src/**/*.js'));
  assert.ok(matchesGlob('api/user.ts', 'api/*.ts'));
  assert.ok(!matchesGlob('api/nested/user.ts', 'api/*.ts'), '* must not cross a /');
  assert.ok(!matchesGlob('src/ui/index.js', 'src/router/**'));
  // leading ./ is normalized away on both sides
  assert.ok(matchesGlob('./src/router/x.js', 'src/router/**'));
});

test('pathInBoundaries: true if ANY glob matches', () => {
  const b = ['src/router/**', 'ui/nodered/**'];
  assert.ok(pathInBoundaries('src/router/x.js', b));
  assert.ok(pathInBoundaries('ui/nodered/panel.tsx', b));
  assert.ok(!pathInBoundaries('src/service/db.js', b));
});

test('boundaryDecision: dormant when no boundaries; flags out-of-bounds; passes in-bounds', () => {
  // AC-3 opt-in: no boundaries declared → null (unchanged behaviour)
  assert.equal(boundaryDecision('anything.js', []), null);
  assert.equal(boundaryDecision('anything.js', undefined), null);
  // in-bounds → null (allowed)
  assert.equal(boundaryDecision('src/router/x.js', ['src/router/**']), null);
  // out-of-bounds → a decision object naming the path
  const d = boundaryDecision('src/service/db.js', ['src/router/**']);
  assert.ok(d && d.out === true);
  assert.equal(d.path, 'src/service/db.js');
});

test('editTargets: pulls file_path from Edit/Write/MultiEdit tool inputs', () => {
  assert.deepEqual(editTargets('Edit', { file_path: '/repo/src/a.js' }), ['/repo/src/a.js']);
  assert.deepEqual(editTargets('Write', { file_path: 'src/b.js' }), ['src/b.js']);
  assert.deepEqual(editTargets('MultiEdit', { file_path: 'src/c.js' }), ['src/c.js']);
  assert.deepEqual(editTargets('Bash', { command: 'rm x' }), []); // not an edit tool
});

test('bashTargets: best-effort file targets from mutating commands', () => {
  assert.deepEqual(bashTargets('rm -rf src/service/old.js').sort(), ['src/service/old.js']);
  assert.deepEqual(bashTargets('mv a/one.js b/two.js').sort(), ['a/one.js', 'b/two.js']);
  assert.ok(bashTargets('sed -i "" s/x/y/ config/app.json').includes('config/app.json'));
  // MBI-133: the sed SCRIPT (s/x/y) must NOT be mistaken for a file path — only the real file is a target
  assert.deepEqual(bashTargets('sed -i "" s/a/b/ src/router/index.js'), ['src/router/index.js']);
  assert.ok(!bashTargets('sed -i "" s/a/b/ config/other.json').includes('s/a/b'));
  // …and the fix must NOT drop an ABSOLUTE-path target (the live hook passes absolute file_paths, which
  // start with `/` like a sed address — they must still be captured, not excluded)
  assert.deepEqual(bashTargets('sed -i "" s/a/b/ /repo/config/other.json'), ['/repo/config/other.json']);
  assert.deepEqual(bashTargets("sed -i '' s/a/b/g /repo/src/router/index.js"), ['/repo/src/router/index.js']);
  assert.ok(bashTargets('echo hi > dist/out.txt').includes('dist/out.txt'));
  assert.ok(bashTargets('git rm src/gone.js').includes('src/gone.js'));
  // a read-only command yields no targets
  assert.deepEqual(bashTargets('cat src/a.js'), []);
  assert.deepEqual(bashTargets('npm test'), []);
});

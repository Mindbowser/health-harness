'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { discoverDocs, docRank } = require('../bin/doc-scan.js');

test('docRank: README first, then agent instructions, then architecture, then the rest; non-docs excluded', () => {
  assert.ok(docRank('README.md') < docRank('CLAUDE.md'));
  assert.ok(docRank('CLAUDE.md') < docRank('ARCHITECTURE.md'));
  assert.ok(docRank('ARCHITECTURE.md') < docRank('docs/guide.md'));
  assert.strictEqual(docRank('src/index.ts'), Infinity);   // code is not a doc
  assert.strictEqual(docRank('package.json'), Infinity);
});

test('discoverDocs: returns doc files ranked, ignoring vendored/build dirs', () => {
  const paths = [
    'src/app.ts', 'README.md', 'docs/guide.md', 'CONTRIBUTING.md',
    'node_modules/foo/README.md', 'CLAUDE.md', 'dist/bundle.js', 'ARCHITECTURE.md',
    '.github/pull_request_template.md',
  ];
  const docs = discoverDocs(paths);
  assert.deepStrictEqual(docs.slice(0, 4), ['README.md', 'CLAUDE.md', 'ARCHITECTURE.md', 'CONTRIBUTING.md']);
  assert.ok(docs.includes('docs/guide.md'));
  assert.ok(!docs.some((d) => d.includes('node_modules')));  // vendored docs ignored
  assert.ok(!docs.some((d) => d.includes('dist/')));         // build output ignored
  assert.ok(!docs.includes('src/app.ts'));
});

test('discoverDocs: agent-instruction files (AGENTS.md, .cursorrules) are surfaced high', () => {
  const docs = discoverDocs(['README.md', 'AGENTS.md', '.cursorrules', 'src/x.js']);
  assert.ok(docs.indexOf('AGENTS.md') <= 2);
  assert.ok(docs.includes('.cursorrules'));
});

test('discoverDocs: empty / no docs → empty list (never throws)', () => {
  assert.deepStrictEqual(discoverDocs([]), []);
  assert.deepStrictEqual(discoverDocs(['src/a.ts', 'bin/b.js']), []);
});

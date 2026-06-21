'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { parseRegistry, listStacks, matchStack, registrySource } = require('../bin/boilerplate-registry.js');

const REG = {
  'react-node': { repo: 'https://github.com/Mindbowser/bp-react-node', kind: 'monorepo', aliases: ['react+node', 'mern'] },
  'nextjs': { repo: 'https://github.com/Mindbowser/bp-nextjs', kind: 'frontend' },
  'fastapi': { repo: 'https://github.com/Mindbowser/bp-fastapi', kind: 'backend' },
};

test('parseRegistry: accepts valid map, rejects junk', () => {
  assert.deepStrictEqual(parseRegistry(JSON.stringify(REG)), REG);
  assert.deepStrictEqual(parseRegistry('not json'), {});       // bad JSON → {}
  assert.deepStrictEqual(parseRegistry(JSON.stringify({ x: { kind: 'fe' } })), {}); // entry without repo → dropped
});

test('listStacks returns the keys', () => {
  assert.deepStrictEqual(listStacks(REG).sort(), ['fastapi', 'nextjs', 'react-node']);
});

test('matchStack: exact key, alias, fuzzy (punctuation-insensitive)', () => {
  assert.strictEqual(matchStack(REG, 'nextjs').repo, REG.nextjs.repo);
  assert.strictEqual(matchStack(REG, 'Next.js').key, 'nextjs');        // punctuation/case-insensitive
  assert.strictEqual(matchStack(REG, 'react+node').key, 'react-node'); // alias
  assert.strictEqual(matchStack(REG, 'MERN').key, 'react-node');       // alias, case-insensitive
  assert.strictEqual(matchStack(REG, 'fast api').key, 'fastapi');      // fuzzy
  assert.strictEqual(matchStack(REG, 'cobol'), null);                  // no match
  assert.strictEqual(matchStack(REG, ''), null);
});

test('registrySource: baked-in by default, overridable by env', () => {
  assert.match(registrySource({}), /baked-in/);
  assert.strictEqual(registrySource({ MB_BOILERPLATE_REGISTRY: 'Acme/bp' }), 'Acme/bp');
});

test('the baked-in config/boilerplates.json is valid and resolvable', () => {
  const fs = require('fs'), path = require('path');
  const reg = parseRegistry(fs.readFileSync(path.join(__dirname, '..', 'config', 'boilerplates.json'), 'utf8'));
  const stacks = listStacks(reg);
  assert.ok(stacks.length >= 15, 'expected the full MB boilerplate set');
  for (const k of stacks) {
    assert.match(reg[k].repo, /github\.com\/Mindbowser\//, `${k} must point at a Mindbowser repo`);
    assert.ok(['frontend', 'backend', 'monorepo'].includes(reg[k].kind), `${k} needs a valid kind`);
  }
  assert.strictEqual(matchStack(reg, 'next.js').key, 'nextjs');
  assert.strictEqual(matchStack(reg, 'fhir').key, 'spring-fhir');
  assert.strictEqual(matchStack(reg, 'flutter').key, 'flutter');
  assert.strictEqual(matchStack(reg, 'spring boot').key, 'spring-rest');
});

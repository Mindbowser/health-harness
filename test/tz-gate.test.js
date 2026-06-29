'use strict';
// Tier 2 of the timezone-assurance spec: run the gate under a HOSTILE clock for date-touching work.
// The hostile zone must (a) differ from the team's home zone and (b) have DST — so for an India team
// on Asia/Kolkata (no DST) the default is a Western DST zone, NOT Kolkata. See docs/timezone-assurance.md.
const { test } = require('node:test');
const assert = require('node:assert');
const { pickHostileTz, withTz, hostileGate } = require('../bin/tz-gate.js');

test('pickHostileTz: differs from home and has DST (Kolkata → New_York; never the home zone)', () => {
  assert.strictEqual(pickHostileTz('Asia/Kolkata'), 'America/New_York', 'India team default');
  assert.strictEqual(pickHostileTz(''), 'America/New_York', 'no home → safe DST default');
  assert.strictEqual(pickHostileTz(undefined), 'America/New_York');
  // if home already IS the default, fall back to another DST zone (45-min + DST) so it still differs
  assert.strictEqual(pickHostileTz('America/New_York'), 'Pacific/Chatham', 'home==default → alternate');
  assert.notStrictEqual(pickHostileTz('Asia/Kolkata'), 'Asia/Kolkata', 'never returns the home zone');
});

test('withTz: prefixes TZ to a gate command, idempotently (replaces an existing TZ=)', () => {
  assert.strictEqual(withTz('npm test', 'America/New_York'), 'TZ=America/New_York npm test');
  assert.strictEqual(withTz('  npm test  ', 'America/New_York'), 'TZ=America/New_York npm test', 'trims');
  assert.strictEqual(withTz('TZ=UTC npm test', 'America/New_York'), 'TZ=America/New_York npm test', 'replaces existing TZ');
  assert.strictEqual(withTz('', 'America/New_York'), '', 'empty stays empty');
});

test('hostileGate: composes {home, tz, command} from a project.json shape; null when no gate', () => {
  assert.deepStrictEqual(
    hostileGate({ gate: 'npm test', timezone: { home: 'Asia/Kolkata' } }),
    { home: 'Asia/Kolkata', tz: 'America/New_York', command: 'TZ=America/New_York npm test' });
  // home defaults to Asia/Kolkata (the team's actual home zone) when unset
  assert.deepStrictEqual(
    hostileGate({ gate: 'npm test' }),
    { home: 'Asia/Kolkata', tz: 'America/New_York', command: 'TZ=America/New_York npm test' });
  assert.strictEqual(hostileGate({}), null, 'no gate → null');
  assert.strictEqual(hostileGate(null), null);
});

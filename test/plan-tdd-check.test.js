'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path');
const { isBuildPlan, mentionsTestFirst, planTddNudge } = require('../bin/plan-tdd-check.js');

test('isBuildPlan: implementation plans are build work; pure research/investigation plans are not', () => {
  assert.strictEqual(isBuildPlan('Implement the /patients endpoint and add a React table component'), true);
  assert.strictEqual(isBuildPlan('Fix the pagination bug in the results list'), true);
  assert.strictEqual(isBuildPlan('Add a migration for the appointments schema'), true);
  assert.strictEqual(isBuildPlan('Research how the auth flow works and summarize the findings'), false);
  assert.strictEqual(isBuildPlan('Investigate the flaky CI and report root cause'), false);
});

test('mentionsTestFirst: recognizes explicit red-green / test-first structure, not a passing mention of "tests"', () => {
  assert.strictEqual(mentionsTestFirst('Write a failing test first, then implement, then refactor'), true);
  assert.strictEqual(mentionsTestFirst('TDD: red → green → refactor for each slice'), true);
  assert.strictEqual(mentionsTestFirst('Add the endpoint. We will run the tests at the end.'), false); // tests after, not first
  assert.strictEqual(mentionsTestFirst('Implement the component'), false);                              // no tests at all
});

test('planTddNudge: a build plan without test-first structure is flagged; a TDD plan or a research plan is not', () => {
  const bad = planTddNudge('Implement the /patients endpoint, wire the UI, done.');
  assert.strictEqual(bad.nudge, true);
  assert.match(bad.reason, /TDD|test-first|failing test/i);

  assert.strictEqual(planTddNudge('Implement /patients: write a failing test first, then code, then refactor. Gate green each step.').nudge, false);
  assert.strictEqual(planTddNudge('Research the third-party API and write up options.').nudge, false); // not build work
  assert.strictEqual(planTddNudge('').nudge, false);
});

test('hooks.json wires a PreToolUse ExitPlanMode hook to plan-tdd-check (so a plan is flagged before it is accepted)', () => {
  const hooks = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'hooks', 'hooks.json'), 'utf8'));
  const pre = (hooks.hooks && hooks.hooks.PreToolUse) || [];
  const wired = pre.find((h) => /ExitPlanMode/.test(h.matcher || ''));
  assert.ok(wired, 'a PreToolUse entry must match ExitPlanMode');
  assert.ok(JSON.stringify(wired).includes('plan-tdd-check.js'), 'the ExitPlanMode hook must run plan-tdd-check.js');
});

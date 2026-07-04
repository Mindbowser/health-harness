'use strict';
// MBI-117 (S6) — docs + release. The /harness-feedback command + the `feedback` record schema are documented
// in README, the metadata-only guarantee for all OTHER telemetry is stated as unchanged, and the current
// no-server-dedup gap is noted. (The version bump that cuts the release is guarded by version-check.test.js.)
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs'), path = require('node:path');
const README = fs.readFileSync(path.join(__dirname, '..', 'README.md'), 'utf8');

test('[AC-1] README documents the /harness-feedback command + reflect-back/agree + the feedback record schema', () => {
  assert.match(README, /\/harness-feedback/, 'the command is named');
  assert.match(README, /reflects? back/i, 'the reflect-back/agree step is described');
  assert.match(README, /`feedback`[\s\S]{0,80}record|feedback record/i, 'the feedback record type is described');
  // queryable by version / user / type, joinable to the usage stream via sessionId
  assert.match(README, /queryable by[\s\S]{0,120}version[\s\S]{0,60}user[\s\S]{0,60}type/i, 'queryable by version/user/type');
  assert.match(README, /sessionId/, 'joinable to the usage stream via sessionId');
});

test('[AC-2] README states the metadata-only guarantee is unchanged + notes the no-server-dedup gap', () => {
  assert.match(README, /metadata-only guarantee[\s\S]{0,120}(unchanged|other|separate)/i,
    'the metadata-only guarantee for all OTHER telemetry is explicitly unchanged');
  assert.match(README, /dedup[\s\S]{0,120}(not yet|known gap|gap)/i, 'the current no-server-dedup gap is noted');
});

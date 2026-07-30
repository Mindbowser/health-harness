'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs'), path = require('path'), os = require('os');
const {
  commitReviewState, withCommitReview, setCommitReview,
} = require('../bin/commit-review.js');

test('[MBI-141 AC-1] commitReviewState: on iff wall.autoApprove.commit===false (default off)', () => {
  assert.equal(commitReviewState({}), 'off');                                       // unset → auto-approve → off
  assert.equal(commitReviewState({ wall: { autoApprove: { commit: true } } }), 'off');
  assert.equal(commitReviewState({ wall: { autoApprove: { commit: false } } }), 'on'); // review armed
});

test('[MBI-141 AC-1] withCommitReview: sets the flag, preserves ALL other keys + sibling wall flags', () => {
  const before = { commit: { conventional: true }, wall: { autoApprove: { trackerWrite: true } }, model: 'opus' };
  const on = withCommitReview(before, true);   // arm review → commit:false
  assert.equal(on.wall.autoApprove.commit, false);
  assert.equal(on.wall.autoApprove.trackerWrite, true);   // sibling flag preserved
  assert.deepEqual(on.commit, { conventional: true });     // other keys preserved
  assert.equal(on.model, 'opus');
  const off = withCommitReview(on, false);     // disarm → commit:true
  assert.equal(off.wall.autoApprove.commit, true);
  assert.equal(off.wall.autoApprove.trackerWrite, true);
});

test('[MBI-141 AC-1] setCommitReview writes the repo-root committed project.json + round-trips', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cr-'));
  fs.mkdirSync(path.join(root, '.health-harness'), { recursive: true });
  fs.writeFileSync(path.join(root, '.health-harness', 'project.json'), JSON.stringify({ commit: { requireTicket: true } }));
  setCommitReview(root, true);
  const j = JSON.parse(fs.readFileSync(path.join(root, '.health-harness', 'project.json'), 'utf8'));
  assert.equal(j.wall.autoApprove.commit, false);         // armed
  assert.deepEqual(j.commit, { requireTicket: true });    // preserved
  setCommitReview(root, false);
  assert.equal(JSON.parse(fs.readFileSync(path.join(root, '.health-harness', 'project.json'), 'utf8')).wall.autoApprove.commit, true);
});

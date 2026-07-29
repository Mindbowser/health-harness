'use strict';
const { test } = require('node:test');
const assert = require('node:assert');
const { renderStatusline } = require('../bin/statusline.js');

test('[MBI-138] renderStatusline: dir · ticket · ❓N badge; badge hidden at 0; segments dropped when absent', () => {
  const full = renderStatusline({ dir: 'boundary-test', ticket: 'MBI-129', open: 2 });
  assert.match(full, /boundary-test/);
  assert.match(full, /MBI-129/);
  assert.match(full, /2/);            // the badge count
  assert.match(full, /\?|open/i);     // reads as open-questions

  // nothing open → no badge segment
  const noOpen = renderStatusline({ dir: 'repo', ticket: 'MBI-1', open: 0 });
  assert.match(noOpen, /repo/);
  assert.match(noOpen, /MBI-1/);
  assert.ok(!/open/i.test(noOpen), 'no badge when 0 open');

  // no ticket (e.g. on main) → just the dir, still renders
  assert.equal(renderStatusline({ dir: 'repo', ticket: null, open: 0 }), 'repo');
  // empty input → empty string, never throws
  assert.equal(renderStatusline({}), '');
  assert.equal(renderStatusline(), '');
});

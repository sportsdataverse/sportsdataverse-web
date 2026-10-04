import { test } from 'node:test';
import assert from 'node:assert/strict';
import { viewsReply } from '../lib/viewsReply.ts';

test('a successful Supabase write (204) is answered without a body', () => {
  // Response.json() throws for a null-body status, which is what made every view POST a 500
  assert.deepEqual(viewsReply(204), { status: 204, hasBody: false });
  assert.deepEqual(viewsReply(205), { status: 205, hasBody: false });
  assert.deepEqual(viewsReply(304), { status: 304, hasBody: false });
});

test('statuses that may carry a body pass through', () => {
  assert.deepEqual(viewsReply(201), { status: 201, hasBody: true });
  assert.deepEqual(viewsReply(401), { status: 401, hasBody: true });
});

test('a failed request (status 0, missing, or not an HTTP status) is a JSON 500', () => {
  for (const bad of [0, undefined, null, 'ok', 99, 600, 101]) {
    assert.deepEqual(viewsReply(bad), { status: 500, hasBody: true });
  }
});

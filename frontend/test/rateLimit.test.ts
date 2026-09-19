import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fakeDb } from './fakeDb.ts';
import { allowRequest } from '../lib/rateLimit.ts';

test('allows `limit` hits per window, then refuses with a retry-after, then resets', async () => {
  const { db } = fakeDb();
  let t = Date.UTC(2026, 8, 19, 12, 0, 30); // 12:00:30Z
  const now = () => new Date(t);
  const opts = { limit: 2, windowSec: 3600, now };
  const a = await allowRequest(db, 'join:1.2.3.4', opts);
  const b = await allowRequest(db, 'join:1.2.3.4', opts);
  const c = await allowRequest(db, 'join:1.2.3.4', opts);
  assert.deepEqual([a.allowed, b.allowed, c.allowed], [true, true, false]);
  assert.deepEqual([a.remaining, b.remaining, c.remaining], [1, 0, 0]);
  assert.equal(c.retryAfterSec, 3600 - 30); // to the top of the hour
  // another key is independent
  assert.equal((await allowRequest(db, 'join:5.6.7.8', opts)).allowed, true);
  // next window
  t += 3600 * 1000;
  assert.equal((await allowRequest(db, 'join:1.2.3.4', opts)).allowed, true);
});

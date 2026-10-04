import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getFormattedDate } from '../utils/date.ts';

test('post dates read the same in every timezone', () => {
  const saved = process.env.TZ;
  try {
    for (const tz of ['America/Los_Angeles', 'UTC', 'Asia/Tokyo']) {
      process.env.TZ = tz;
      assert.equal(getFormattedDate(new Date('2026-06-12T00:00:00Z')), 'June 12, 2026', tz);
      // a year boundary: the server (UTC) says Jan 1; a Los Angeles browser used to say Dec 31, 2025
      assert.equal(getFormattedDate(new Date('2026-01-01T00:00:00Z')), 'Jan 1, 2026', tz);
    }
  } finally {
    if (saved === undefined) delete process.env.TZ;
    else process.env.TZ = saved;
  }
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { joinSchema, isReservedEmail } from '../lib/joinSchema.ts';

test('a full /join body with answers and an identity parses', () => {
  const r = joinSchema.safeParse({ email: 'a@b.co', answers: { role: 'x' }, identity: { name: 'Ann', location: { country: 'US', region: 'TX' } } });
  assert.equal(r.success, true);
  assert.equal(r.success && r.data.identity?.name, 'Ann');
});

test('normalizes the email and defaults wants.newsletter to true', () => {
  const r = joinSchema.safeParse({ email: '  Alice@Example.ORG ' });
  assert.equal(r.success, true);
  assert.deepEqual(r.data, { email: 'alice@example.org', wants: { newsletter: true } });
});

test('rejects wants.newsletter: false', () => {
  assert.equal(joinSchema.safeParse({ email: 'a@b.co', wants: { newsletter: false } }).success, false);
});

test('rejects a non-email and an unknown placement', () => {
  assert.equal(joinSchema.safeParse({ email: 'not-an-email' }).success, false);
  assert.equal(joinSchema.safeParse({ email: 'a@b.co', placement: 'sidebar' }).success, false);
  assert.equal(joinSchema.safeParse({ email: 'a@b.co', placement: 'footer' }).success, true);
});

test('reserved domains are recognised, real ones are not', () => {
  for (const e of ['x@example.com', 'x@sub.example.org', 'x@foo.test', 'x@bar.invalid', 'x@localhost']) {
    assert.equal(isReservedEmail(e), true, e);
  }
  for (const e of ['x@gmail.com', 'x@example.co.uk', 'x@sportsdataverse.org']) {
    assert.equal(isReservedEmail(e), false, e);
  }
});

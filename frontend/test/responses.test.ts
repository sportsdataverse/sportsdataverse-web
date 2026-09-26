import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ObjectId, type Db } from 'mongodb';
import { fakeDb } from './fakeDb.ts';
import { insertResponse, deleteResponsesForPerson, ensureResponseIndexes } from '../lib/responses.ts';

const T0 = new Date('2026-09-25T12:00:00Z');
const ID = { name: 'Pat', location: { country: 'US', region: 'TX' } };
const P = { role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'github', updatesVia: ['github'], newsChannel: 'discord' } as never;

test('responses are appended, one per submission, and deleted per person', async () => {
  const { db, dump } = fakeDb();
  const a = new ObjectId(), b = new ObjectId();
  await insertResponse(db, { personId: a, source: 'join', createdAt: T0, identity: ID, answers: { role: 'developer' }, profile: P });
  await insertResponse(db, { personId: a, source: 'survey', createdAt: T0, identity: ID, answers: { role: 'student' }, profile: P });
  await insertResponse(db, { personId: b, source: 'survey', createdAt: T0, identity: ID, answers: {}, profile: P });
  assert.equal(dump('responses').length, 3);
  assert.equal(await deleteResponsesForPerson(db, a), 2);
  assert.deepEqual(dump('responses').map((r) => String(r.personId)), [String(b)]);
});

test('ensureResponseIndexes creates { personId: 1, createdAt: -1 }', async () => {
  const calls: unknown[] = [];
  const db = { collection: () => ({ createIndex: async (...args: unknown[]) => { calls.push(args); return 'x'; } }) } as unknown as Db;
  await ensureResponseIndexes(db);
  assert.deepEqual(calls, [[{ personId: 1, createdAt: -1 }]]);
});

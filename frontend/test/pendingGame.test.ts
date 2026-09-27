import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePendingGame } from '../lib/platform/pendingGame.ts';

const games = [{ id: 'a' }, { id: 'b' }];

test('no pending id: nothing to load, nothing to disarm, regardless of outcome', () => {
  assert.deepEqual(resolvePendingGame('', { games }), { toLoad: '', nextPending: '' });
  assert.deepEqual(resolvePendingGame('', { failed: true }), { toLoad: '', nextPending: '' });
});

test('pending id present in a loaded list: load it, and it is spent', () => {
  assert.deepEqual(resolvePendingGame('a', { games }), { toLoad: 'a', nextPending: '' });
});

test('pending id absent from a non-empty loaded list: drop it, never fetch', () => {
  assert.deepEqual(resolvePendingGame('z', { games }), { toLoad: '', nextPending: '' });
});

test('season loaded with zero games: drop the pending id', () => {
  assert.deepEqual(resolvePendingGame('a', { games: [] }), { toLoad: '', nextPending: '' });
});

test('season failed to load (error, or a missing-column short-circuit): drop the pending id', () => {
  assert.deepEqual(resolvePendingGame('a', { failed: true }), { toLoad: '', nextPending: '' });
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOOKUP_SPORTS, newestSeasonAsset } from '../content/lookups.ts';

// Asset names as published on sportsdataverse-data, 2026-09-26.
const CFB = ['cfb_rosters_2024.parquet', 'cfb_rosters_2026.parquet', 'cfb_rosters_2025.parquet', 'roster_2026.parquet', 'cfb_rosters_2026.rds', 'timestamp.json'];
const NBA = ['rosters_2025.parquet', 'rosters_2026.parquet', 'rosters_2027.parquet', 'rosters_2027.rds'];
const NFL = ['roster_2025.parquet', 'roster_2026.parquet', 'roster_2002.parquet'];

test('picks the newest season parquet for the prefix', () => {
  assert.equal(newestSeasonAsset(CFB, 'cfb_rosters_'), 'cfb_rosters_2026.parquet');
  assert.equal(newestSeasonAsset(NBA, 'rosters_'), 'rosters_2027.parquet');
  assert.equal(newestSeasonAsset(NFL, 'roster_'), 'roster_2026.parquet');
});

test('a prefix never matches a longer stem, and non-parquet files are ignored', () => {
  assert.equal(newestSeasonAsset(NBA, 'roster_'), null); // "rosters_" is not "roster_"
  assert.equal(newestSeasonAsset(['cfb_rosters_2027.rds'], 'cfb_rosters_'), null);
});

test('every sport names a prefix, not a pinned file', () => {
  for (const s of LOOKUP_SPORTS) {
    assert.match(s.assetPrefix, /_$/, s.key);
    assert.equal('asset' in s, false, `${s.key} still pins a file`);
  }
  assert.equal(LOOKUP_SPORTS.find((s) => s.key === 'cfb')?.assetPrefix, 'cfb_rosters_');
});

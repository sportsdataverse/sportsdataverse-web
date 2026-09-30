import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ogSummary, ogParams, ogCard, ogMetadata, SUMMARY_MAX } from '../lib/ogSummary.ts';

const sp = (qs: string) => new URLSearchParams(qs);

test('wp: sport label, season and game', () => {
  assert.equal(ogSummary('wp', sp('sport=nfl&season=2024&game=2024_01_BAL_KC')), 'NFL · 2024 · game 2024_01_BAL_KC');
});

test('explore: the SQL never reaches the summary, the og:url or the image URL', () => {
  const q = sp('tag=x&sql=select%20*%20from%20secret_table');
  assert.ok(!ogSummary('explore', q).includes('select'));
  assert.equal(ogParams('explore', q).get('sql'), null);
  assert.equal(ogParams('explore', q).toString(), 'tag=x');
});

test('an unknown view is Platform, with no summary on the card', () => {
  assert.equal(ogSummary('nope', sp('sport=nfl')), 'Platform');
  assert.deepEqual(ogCard('nope', sp('sport=nfl')), { title: 'Platform', summary: '' });
  // Object.prototype keys are not views
  for (const v of ['constructor', '__proto__', 'toString']) assert.deepEqual(ogCard(v, sp('')), { title: 'Platform', summary: '' });
});

test(`every summary stays within ${SUMMARY_MAX} characters`, () => {
  const long = 'a'.repeat(30);
  const s = ogSummary('scatter', sp(`schema=nba_stats&table=player_season_stats&season=2024&x=${long}&y=${long}`));
  assert.ok(s.length <= SUMMARY_MAX, s);
  assert.ok(s.endsWith('…'));
});

test('a filter value is never in the summary or the canonical params', () => {
  const cases: [string, string][] = [
    ['explore', 'tag=espn_cfb_pbp&table=pbp&season=2024&w.team=SECRETVALUE'],
    ['query', 'schema=nfl&table=pbp&posteam=SECRETVALUE&epa__gte=SECRETVALUE'],
    ['lookups', 'sport=nfl&q=SECRETVALUE'],
    ['scatter', 'season=2024&hl=SECRETVALUE'],
    ['ratings', 'league=nfl&season=2024&grid.f.team=SECRETVALUE'],
  ];
  for (const [view, qs] of cases) {
    assert.ok(!ogSummary(view, sp(qs)).includes('SECRETVALUE'), view);
    assert.ok(!ogParams(view, sp(qs)).toString().includes('SECRETVALUE'), view);
  }
});

test('grid.* keys are dropped', () => {
  const q = sp('league=nfl&season=2024&grid.sort=-rating&grid.pin=team:KC,BAL&grid.f.team=KC&grid.tint=pct&grid.q=1');
  assert.equal(ogParams('ratings', q).toString(), 'league=nfl&season=2024');
  assert.equal(ogSummary('ratings', q), 'NFL · 2024');
  assert.equal(ogParams('query', sp('schema=nfl&table=pbp&grid.sort=epa')).toString(), 'schema=nfl&table=pbp');
});

test('over-long params are capped: a long id is dropped, not truncated onto the card', () => {
  const game = 'x'.repeat(500);
  assert.equal(ogSummary('wp', sp(`sport=nfl&game=${game}`)), 'NFL');
  assert.equal(ogParams('wp', sp(`sport=nfl&game=${game}`)).get('game'), null);
  // an id that fits the page but not the card (33+ chars) stays off the card
  assert.equal(ogSummary('wp', sp(`sport=nfl&game=${'y'.repeat(40)}`)), 'NFL');
  // a flood of params is cut before parsing: a key past the cap is never read
  const flood = Array.from({ length: 5000 }, (_, i) => `j${i}=1`).join('&');
  assert.equal(ogSummary('wp', sp(`${flood}&sport=nfl`)), 'CFB');
});

test('the summary is identifiers only: no spaces, dots or markup smuggled through a token', () => {
  const s = ogSummary('explore', sp('tag=evil.com&table=<b>hi</b>&season=2024'));
  assert.equal(s, '2024');
  assert.equal(ogSummary('trends', sp('sport=nfl_ratings_weekly&stat=Call%20now&team=KC&team=BAL')), 'NFL ratings · 2 teams');
});

test('every view has a summary built from labels, never values', () => {
  assert.equal(ogSummary('trends', sp('sport=nba&stat=avgPoints&season=2024&view=multiples')), 'NBA · avgPoints · 2024 · small multiples');
  assert.equal(ogSummary('explore', sp('tag=espn_cfb_pbp&table=play_by_play&season=2024')), 'espn_cfb_pbp · play_by_play · 2024');
  assert.equal(ogSummary('query', sp('schema=nfl&table=pbp')), 'nfl.pbp');
  assert.equal(ogSummary('lookups', sp('sport=nfl&mode=teams')), 'NFL · teams');
  assert.equal(ogSummary('scatter', sp('season=2024&x=pts&y=ast')), 'NBA player impact · 2024 · pts vs ast');
  assert.equal(ogSummary('rolling', sp('league=nfl&metric=epa&unit=carry')), 'NFL · EPA / carry');
  assert.equal(ogSummary('ratings', sp('league=cfb')), 'CFB');
});

test('metadata: og:url is the view path with its canonical params, og:image the card', () => {
  const m = ogMetadata('wp', sp('sport=nfl&season=2024&game=2024_01_BAL_KC&junk=1'));
  assert.equal(m.title, 'Win probability');
  const og = m.openGraph as { url: string; images: { url: string }[] };
  assert.equal(og.url, '/platform/wp?sport=nfl&season=2024&game=2024_01_BAL_KC');
  assert.equal(og.images[0].url, '/api/og?card=wp&sport=nfl&season=2024&game=2024_01_BAL_KC');
  assert.deepEqual((m.twitter as { images: unknown[] }).images, og.images);
  assert.equal((ogMetadata('query', sp('')).openGraph as { url: string }).url, '/platform/query');
});

test('the card rendered from each image URL says what the page metadata says', () => {
  // the image route reads its view from `card`; a view with its own `view` param (Trends) must survive
  for (const [view, qs] of [
    ['wp', 'sport=nfl&season=2024&game=2024_01_BAL_KC'],
    ['trends', 'sport=nba&stat=avgPoints&season=2024&view=multiples'],
    ['trends', 'sport=nba&stat=avgPoints&season=2024'],
    ['explore', 'tag=espn_cfb_pbp&table=play_by_play&season=2024&sql=select+1'],
    ['query', 'schema=cfb&table=passing'],
    ['lookups', 'sport=cfb&mode=team'],
    ['scatter', 'schema=nba&table=player_impact&season=2026&x=o_rapm&y=d_rapm'],
    ['rolling', 'league=cfb&metric=epa&unit=play'],
    ['ratings', 'league=nba&season=2026'],
  ] as const) {
    const m = ogMetadata(view, sp(qs));
    const img = new URL((m.openGraph as { images: { url: string }[] }).images[0].url, 'https://x');
    const card = ogCard(img.searchParams.get('card') ?? '', img.searchParams);
    assert.deepEqual(card, ogCard(view, sp(qs)), `${view}?${qs}`);
    assert.equal(img.searchParams.getAll('view').length, view === 'trends' && qs.includes('view=') ? 1 : 0, `${view}: one view param at most`);
  }
});

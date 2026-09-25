import { test } from 'node:test';
import assert from 'node:assert/strict';
import { QUESTIONS, SURVEY_SECTIONS, JOIN_SECTIONS } from '../content/survey.ts';
import { visibleQuestions, validateAnswers, projectProfile, contactProperties } from '../lib/survey.ts';

const base = {
  role: 'developer', languages: ['R'], sports: ['CFB'],
  discoveredVia: 'twitter', updatesVia: ['github', 'email'], newsChannel: 'email',
};

test('follow-ups appear only when their trigger answer is present', () => {
  const ids = (a: Record<string, string | string[]>) => visibleQuestions(QUESTIONS, SURVEY_SECTIONS, a).map((q) => q.id);
  assert.ok(ids(base).includes('packages_r'));
  assert.ok(!ids(base).includes('packages_python'));
  assert.ok(ids(base).includes('following')); // discoveredVia twitter
  assert.ok(!ids({ ...base, discoveredVia: 'search' }).includes('following'));
  assert.ok(!ids(base).includes('wants_newsletter')); // wants is not a survey section
});

test('validateAnswers accepts a complete survey and rejects a missing required one', () => {
  const ok = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, packages_r: ['cfbfastR'], dataTypes: ['pbp'], following: 'yes' });
  assert.equal(ok.ok, true);
  const missing = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, role: undefined });
  assert.equal(missing.ok, false);
  assert.match((missing as { message: string }).message, /What best describes you/);
});

test('hidden or unknown answers are dropped, bad option values rejected', () => {
  const r = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, packages_python: ['sportsdataverse-py'], bogus: 'x' });
  assert.equal(r.ok, true);
  const a = (r as { answers: Record<string, unknown> }).answers;
  assert.equal(a.packages_python, undefined); // languages has no Python → hidden → dropped
  assert.equal(a.bogus, undefined);
  const bad = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, role: 'wizard' });
  assert.equal(bad.ok, false);
  const badMulti = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, sports: 'CFB' }); // multi must be an array
  assert.equal(badMulti.ok, false);
});

test('free-list options (packages) accept any short string, limited count', () => {
  const r = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, packages_r: ['cfbfastR', 'hoopR'] });
  assert.equal(r.ok, true);
  const tooMany = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, packages_r: Array.from({ length: 41 }, (_, i) => `p${i}`) });
  assert.equal(tooMany.ok, false);
  const deduped = validateAnswers(QUESTIONS, SURVEY_SECTIONS, { ...base, packages_r: ['cfbfastR', 'cfbfastR', 'hoopR'] });
  assert.deepEqual((deduped as { answers: Record<string, unknown> }).answers.packages_r, ['cfbfastR', 'hoopR']);
});

test('join sections require the wants answers', () => {
  const r = validateAnswers(QUESTIONS, JOIN_SECTIONS, { ...base });
  assert.equal(r.ok, false);
  const ok = validateAnswers(QUESTIONS, JOIN_SECTIONS, { ...base, wants_newsletter: 'yes', wants_discord: 'no', wants_package: 'no', wants_stickers: 'no' });
  assert.equal(ok.ok, true);
});

test('profile projection and contact properties', () => {
  const p = projectProfile({ ...base, packages_r: ['cfbfastR'] });
  assert.deepEqual(p, { role: 'developer', languages: ['R'], sports: ['CFB'], discoveredVia: 'twitter', updatesVia: ['github', 'email'], newsChannel: 'email' });
  assert.deepEqual(contactProperties(p), {
    role: 'developer', languages: 'R', sports: 'CFB', discovered_via: 'twitter', updates_via: 'github,email', news_channel: 'email',
  });
});

test('a follow-up is accepted only when its trigger was itself accepted in this call', () => {
  const r = validateAnswers(QUESTIONS, ['followup'], { languages: ['R'], packages_r: ['cfbfastR'] });
  assert.equal(r.ok, true);
  assert.equal((r as { answers: Record<string, unknown> }).answers.packages_r, undefined);
});

test('the stickers question is required, like the other wants questions', () => {
  const q = QUESTIONS.find((x) => x.id === 'wants_stickers');
  assert.equal(q?.required, true);
});

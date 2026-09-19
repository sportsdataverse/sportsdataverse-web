import type { Answers, Channel, Language, Question, Role, Section } from "../content/survey.ts";

/**
 * Pure questionnaire engine. The UI and the API both derive what is asked and
 * what is accepted from the same question list, so a question hidden by
 * `showIf` can neither be rendered nor smuggled in through the API.
 */
export type Profile = {
  role: Role;
  languages: Language[];
  sports: string[];
  discoveredVia: Channel;
  updatesVia: Channel[];
  newsChannel: Channel;
};

const MAX_FREE_OPTIONS = 40; // optionsKey lists come from the packages collection; cap the array
const MAX_TEXT = 200;

export function visibleQuestions(questions: Question[], sections: Section[], answers: Answers): Question[] {
  const out: Question[] = [];
  for (const q of questions) {
    if (!sections.includes(q.section)) continue;
    if (q.showIf && !q.showIf(answers)) continue;
    out.push(q);
  }
  return out;
}

function checkOne(q: Question, v: unknown): string | null {
  const allowed = q.options?.map((o) => o.value);
  if (q.type === "multi") {
    if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) return `${q.label} — pick one or more`;
    if (v.length > MAX_FREE_OPTIONS) return `${q.label} — too many`;
    if (allowed && v.some((x) => !allowed.includes(x))) return `${q.label} — unknown option`;
    if (!allowed && v.some((x) => x.length === 0 || x.length > MAX_TEXT)) return `${q.label} — bad value`;
    return null;
  }
  if (typeof v !== "string" || v.length === 0 || v.length > MAX_TEXT) return `${q.label} — pick one`;
  if (allowed && !allowed.includes(v)) return `${q.label} — unknown option`;
  return null;
}

export function validateAnswers(
  questions: Question[],
  sections: Section[],
  raw: unknown
): { ok: true; answers: Answers } | { ok: false; message: string } {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const answers: Answers = {};
  // walk in list order so showIf sees exactly the answers a user could have given before it
  for (const q of visibleQuestions(questions, sections, input as Answers)) {
    const v = input[q.id];
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0)) {
      if (q.required) return { ok: false, message: `${q.label} — required` };
      continue;
    }
    const err = checkOne(q, v);
    if (err) return { ok: false, message: err };
    answers[q.id] = v as string | string[];
  }
  return { ok: true, answers };
}

export function projectProfile(answers: Answers): Profile {
  const arr = (v: unknown) => (Array.isArray(v) ? (v as string[]) : []);
  return {
    role: String(answers.role) as Role,
    languages: arr(answers.languages) as Language[],
    sports: arr(answers.sports),
    discoveredVia: String(answers.discoveredVia) as Channel,
    updatesVia: arr(answers.updatesVia) as Channel[],
    newsChannel: String(answers.newsChannel) as Channel,
  };
}

/** Resend contact properties (all string typed; arrays joined with commas). */
export function contactProperties(p: Profile): Record<string, string> {
  return {
    role: p.role,
    languages: p.languages.join(","),
    sports: p.sports.join(","),
    discovered_via: p.discoveredVia,
    updates_via: p.updatesVia.join(","),
    news_channel: p.newsChannel,
  };
}

/**
 * The questionnaire behind /survey and /join, as data. `showIf` runs on the
 * answers given so far; a hidden question is never rendered and never
 * accepted by the server (lib/survey.ts validates against this same list).
 * Adding a follow-up is an edit here only.
 */
export type Channel =
  | "search" | "github" | "twitter" | "bluesky" | "discord" | "email"
  | "rss" | "conference" | "referral" | "youtube" | "other";
export type Role = "student" | "researcher" | "developer" | "hobbyist" | "industry" | "other";
export type Language = "R" | "Python" | "JS" | "other";

export type Section = "profile" | "discovery" | "followup" | "wants";
export type Answers = Record<string, string | string[]>;

export type Question = {
  id: string;
  section: Section;
  type: "single" | "multi" | "text";
  label: string;
  help?: string;
  options?: { value: string; label: string }[];
  /** options filled in by the page at render time (e.g. package names) */
  optionsKey?: "packages_r" | "packages_python";
  required?: boolean;
  showIf?: (answers: Answers) => boolean;
};

const CHANNELS: { value: Channel; label: string }[] = [
  { value: "search", label: "Web search" },
  { value: "github", label: "GitHub" },
  { value: "twitter", label: "Twitter / X" },
  { value: "bluesky", label: "Bluesky" },
  { value: "discord", label: "Discord" },
  { value: "email", label: "Email / newsletter" },
  { value: "rss", label: "RSS" },
  { value: "conference", label: "A talk or conference" },
  { value: "referral", label: "Someone told me" },
  { value: "youtube", label: "YouTube" },
  { value: "other", label: "Somewhere else" },
];

export const SPORTS = ["CFB", "MBB", "WBB", "NFL", "NBA", "WNBA", "NHL", "MLB", "Soccer", "Other"];

const has = (a: Answers, id: string, v: string) => {
  const x = a[id];
  return Array.isArray(x) ? x.includes(v) : x === v;
};

export const QUESTIONS: Question[] = [
  { id: "role", section: "profile", type: "single", label: "What best describes you?", required: true,
    options: [
      { value: "student", label: "Student" }, { value: "researcher", label: "Researcher / academic" },
      { value: "developer", label: "Developer / engineer" }, { value: "hobbyist", label: "Hobbyist" },
      { value: "industry", label: "Work in sports or media" }, { value: "other", label: "Other" },
    ] },
  { id: "languages", section: "profile", type: "multi", label: "Which languages do you use with our tools?", required: true,
    options: [{ value: "R", label: "R" }, { value: "Python", label: "Python" }, { value: "JS", label: "JavaScript / Node" }, { value: "other", label: "Other" }] },
  { id: "sports", section: "profile", type: "multi", label: "Which sports do you work with?", required: true,
    options: SPORTS.map((s) => ({ value: s, label: s })) },

  { id: "discoveredVia", section: "discovery", type: "single", label: "How did you first find a SportsDataverse project?", required: true, options: CHANNELS },
  { id: "updatesVia", section: "discovery", type: "multi", label: "How do you hear about updates today?", required: true, options: CHANNELS },
  { id: "newsChannel", section: "discovery", type: "single", label: "Where would you like news delivered?", required: true,
    options: CHANNELS.filter((c) => ["email", "discord", "github", "bluesky", "twitter", "rss"].includes(c.value)) },

  { id: "packages_r", section: "followup", type: "multi", label: "Which R packages do you use?", optionsKey: "packages_r",
    showIf: (a) => has(a, "languages", "R") },
  { id: "packages_python", section: "followup", type: "multi", label: "Which Python packages do you use?", optionsKey: "packages_python",
    showIf: (a) => has(a, "languages", "Python") },
  { id: "dataTypes", section: "followup", type: "multi", label: "What do you mostly pull?",
    options: [{ value: "pbp", label: "Play-by-play" }, { value: "box", label: "Box scores" }, { value: "schedules", label: "Schedules / rosters" }, { value: "models", label: "Model outputs (EPA, WP, ratings)" }],
    showIf: (a) => Array.isArray(a.sports) && a.sports.length > 0 },
  { id: "following", section: "followup", type: "single", label: "Are you following us there already?",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "Not yet" }],
    showIf: (a) => ["twitter", "bluesky", "youtube"].includes(String(a.discoveredVia)) },

  { id: "wants_newsletter", section: "wants", type: "single", label: "Email newsletter: new data, methods posts, releases.", required: true,
    options: [{ value: "yes", label: "Yes, sign me up" }, { value: "no", label: "No thanks" }] },
  { id: "wants_discord", section: "wants", type: "single", label: "Would you like an invite to the Discord?", required: true,
    help: "Invites are reviewed by a member; we'll email you.",
    options: [{ value: "yes", label: "Yes" }, { value: "no", label: "No" }] },
];

export const SURVEY_SECTIONS: Section[] = ["profile", "discovery", "followup"];
export const JOIN_SECTIONS: Section[] = ["profile", "discovery", "followup", "wants"];

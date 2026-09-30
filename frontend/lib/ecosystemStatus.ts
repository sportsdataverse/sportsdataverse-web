/**
 * The public ecosystem status snapshot: `status/summary.json` in the public
 * sportsdataverse/.github repo, regenerated nightly. Everything the `/status`
 * page and the package cards show comes from that one public file — never
 * from a platform (members-only) reader.
 *
 * No next-auth or Mongo imports: `node --test` loads this module directly.
 */

export const SUMMARY_URL =
  "https://raw.githubusercontent.com/sportsdataverse/.github/main/status/summary.json";
export const SNAPSHOT_PAGE_URL =
  "https://github.com/sportsdataverse/.github/blob/main/status/ecosystem.md";
export const RELEASES_URL = "https://github.com/sportsdataverse/sportsdataverse-data/releases";
const BADGES_BASE =
  "https://raw.githubusercontent.com/sportsdataverse/.github/main/status/badges";

export const PRODUCER_STATES = ["fresh", "idle", "stale", "failing", "unknown"] as const;
export type ProducerState = (typeof PRODUCER_STATES)[number];

export type WorkflowRun = {
  name: string;
  /** Workflow file, e.g. `daily_wbb.yml`; its stem keys the `wf-<stem>` badge. */
  file: string;
  conclusion: string | null;
  created_at: string | null;
  event: string | null;
  url: string | null;
};

export type Producer = {
  /** `sportsdataverse/<name>` */
  repo: string;
  /** Human name, e.g. `College football (ESPN)`; the repo name when the snapshot has none. */
  label: string;
  /** The `-raw` repo the producer builds from, when there is one. */
  raw_repo: string | null;
  /** When it runs, in words, e.g. `Daily, late Oct-mid Jul`. */
  schedule: string | null;
  sport: string;
  /** Loader repo names that read this producer's releases (`hoopR`, `sportsdataverse-py`). */
  packages: string[];
  state: ProducerState;
  in_season: boolean;
  updated_at: string | null;
  through_season: number | null;
  tags: number;
  workflows: WorkflowRun[];
};

export type PackageRepo = {
  repo: string;
  latest_release_tag: string | null;
  published_at: string | null;
  workflows: WorkflowRun[];
};

export type RedWorkflow = {
  repo: string;
  name: string;
  conclusion: string | null;
  created_at: string | null;
  url: string | null;
};

export type ReleaseTag = {
  tag: string;
  /** Producer repo full name, or null when no producers.json rule maps the tag. */
  producer: string | null;
  assets: number;
  newest_asset_at: string | null;
  max_season: number | null;
};

export type EcosystemSummary = {
  generated_at: string;
  /** Top-level numeric counts only (nested ones such as `producers: {fresh, idle}` are dropped); the page derives its tiles from the arrays. */
  totals: Record<string, number>;
  producers: Producer[];
  packages: PackageRepo[];
  red_workflows: RedWorkflow[];
  unmapped_tags: string[];
  /** One per sportsdataverse-data release tag, stalest first. */
  release_tags: ReleaseTag[];
};

// ---- normalisation: the snapshot is remote input, so nothing is trusted ----

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const iso = (v: unknown): string | null => {
  const s = str(v);
  return s && !Number.isNaN(Date.parse(s)) ? s : null;
};
/** Rendered as an href, so only https survives (no `javascript:` from a bad file). */
const https = (v: unknown): string | null => {
  const s = str(v);
  return s?.startsWith("https://") ? s : null;
};
/** `owner/name` only — it becomes a GitHub URL path and a page anchor. */
const repo = (v: unknown): string | null => {
  const s = str(v);
  return s && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(s) ? s : null;
};
const list = <T>(v: unknown, f: (x: unknown) => T | null): T[] =>
  Array.isArray(v) ? v.map(f).filter((x): x is T => x !== null) : [];

function workflow(v: unknown): WorkflowRun | null {
  if (!isObj(v)) return null;
  const name = str(v.name) ?? str(v.file);
  if (!name) return null;
  return {
    name,
    file: str(v.file) ?? "",
    conclusion: str(v.conclusion),
    created_at: iso(v.created_at),
    event: str(v.event),
    url: https(v.url),
  };
}

function producer(v: unknown): Producer | null {
  if (!isObj(v)) return null;
  const r = repo(v.repo);
  if (!r) return null;
  const state = PRODUCER_STATES.find((s) => s === v.state) ?? "unknown";
  return {
    repo: r,
    label: str(v.label) ?? producerAnchor(r),
    raw_repo: repo(v.raw_repo),
    schedule: str(v.schedule),
    sport: str(v.sport) ?? "",
    packages: list(v.packages, str),
    state,
    in_season: v.in_season === true,
    updated_at: iso(v.updated_at),
    through_season: num(v.through_season),
    tags: num(v.tags) ?? 0,
    workflows: list(v.workflows, workflow),
  };
}

function packageRepo(v: unknown): PackageRepo | null {
  if (!isObj(v)) return null;
  const r = repo(v.repo);
  if (!r) return null;
  return {
    repo: r,
    latest_release_tag: str(v.latest_release_tag),
    published_at: iso(v.published_at),
    workflows: list(v.workflows, workflow),
  };
}

function redWorkflow(v: unknown): RedWorkflow | null {
  if (!isObj(v)) return null;
  const r = repo(v.repo);
  const name = str(v.name);
  if (!r || !name) return null;
  return {
    repo: r,
    name,
    conclusion: str(v.conclusion),
    created_at: iso(v.created_at),
    url: https(v.url),
  };
}

function releaseTag(v: unknown): ReleaseTag | null {
  if (!isObj(v)) return null;
  const tag = str(v.tag);
  if (!tag) return null;
  return {
    tag,
    producer: repo(v.producer),
    assets: num(v.assets) ?? 0,
    newest_asset_at: iso(v.newest_asset_at),
    max_season: num(v.max_season),
  };
}

/**
 * Validate and normalise a parsed `summary.json`. Unknown producer states read
 * as `unknown`; missing optional fields get empty defaults; entries without the
 * fields they are keyed on are dropped. Returns null when the snapshot can't be
 * trusted at all (not an object, no parseable `generated_at`, or no producers):
 * the page then says the snapshot is unavailable rather than showing an empty
 * success.
 */
export function normalizeSummary(raw: unknown): EcosystemSummary | null {
  if (!isObj(raw)) return null;
  const generated_at = iso(raw.generated_at);
  if (!generated_at || !Array.isArray(raw.producers)) return null;
  const producers = list(raw.producers, producer);
  if (producers.length === 0) return null;
  const totals: Record<string, number> = {};
  if (isObj(raw.totals)) {
    for (const [k, v] of Object.entries(raw.totals)) {
      const n = num(v);
      if (n !== null) totals[k] = n;
    }
  }
  return {
    generated_at,
    totals,
    producers,
    packages: list(raw.packages, packageRepo),
    red_workflows: list(raw.red_workflows, redWorkflow),
    unmapped_tags: list(raw.unmapped_tags, str),
    release_tags: list(raw.release_tags, releaseTag),
  };
}

/**
 * Fetch the snapshot, cached for an hour. `ECOSYSTEM_STATUS_URL` overrides the
 * source (a branch's raw URL, or a local fixture server). Any failure — network,
 * non-200, bad JSON, bad shape — is null, never a throw.
 */
export async function loadEcosystemSummary(
  url: string = process.env.ECOSYSTEM_STATUS_URL || SUMMARY_URL
): Promise<EcosystemSummary | null> {
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    return normalizeSummary(await res.json());
  } catch {
    return null;
  }
}

// ---- pure display helpers ----

/** `2026-09-09T05:21:38Z` → `2026-09-09` (UTC); null → `—`. */
export function formatDate(value: string | null): string {
  return value ? new Date(value).toISOString().slice(0, 10) : "—";
}

/** `2026-09-30T09:34:12Z` → `2026-09-30 09:34 UTC`; null → `—`. */
export function formatUtc(value: string | null): string {
  if (!value) return "—";
  const s = new Date(value).toISOString();
  return `${s.slice(0, 10)} ${s.slice(11, 16)} UTC`;
}

/** Coarse age: `just now`, `12 min ago`, `5 h ago`, `21 days ago`; null → `—`. */
export function relativeAge(value: string | null, now: number = Date.now()): string {
  if (!value) return "—";
  const minutes = Math.floor((now - Date.parse(value)) / 60_000);
  if (minutes < 1) return "just now"; // also clock skew into the future
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

/** `.github/workflows/daily_wbb.yml` → `daily_wbb`. */
export function workflowStem(file: string): string {
  return (file.split("/").pop() ?? "").replace(/\.ya?ml$/i, "");
}

/** The repo's short name: the badge directory and the `/status#<anchor>` id. */
export function producerAnchor(repoFullName: string): string {
  return repoFullName.split("/").pop() ?? repoFullName;
}

/**
 * The shields endpoint badge for one key of one repo, per the Phase A contract:
 * `https://img.shields.io/endpoint?url=<percent-encoded raw badge JSON URL>`.
 * Keys: `updated`, `through`, `status`, `wf-<workflow-file-stem>`.
 */
export function badgeUrl(repoFullName: string, key: string): string {
  const json = `${BADGES_BASE}/${producerAnchor(repoFullName)}/${key}.json`;
  return `https://img.shields.io/endpoint?url=${encodeURIComponent(json)}`;
}

/** A run's conclusion in badge words: `passing`, `failing`, `cancelled`, … */
export function runLabel(run: Pick<WorkflowRun, "conclusion" | "created_at">): string {
  if (!run.created_at) return "no runs";
  switch (run.conclusion) {
    case "success":
      return "passing";
    case "failure":
    case "timed_out":
    case "startup_failure":
      return "failing";
    case null:
      return "in progress";
    default:
      return run.conclusion.replace(/_/g, " ");
  }
}

/** Badge alt text that stands in for the image: `Update WBB Data: passing, last run 2026-09-09`. */
export function workflowAlt(run: WorkflowRun): string {
  const label = runLabel(run);
  return run.created_at
    ? `${run.name}: ${label}, last run ${formatDate(run.created_at)}`
    : `${run.name}: ${label}`;
}

/** How a producer state reads in text (matches the `status.json` badge wording). */
export function stateLabel(state: ProducerState): string {
  return state === "idle" ? "idle (off-season)" : state;
}

export function stateCounts(producers: Producer[]): Record<ProducerState, number> {
  const counts = { fresh: 0, idle: 0, stale: 0, failing: 0, unknown: 0 };
  for (const p of producers) counts[p.state] += 1;
  return counts;
}

/** Release tags tracked; falls back to per-producer counts for a snapshot without `release_tags`. */
export function trackedTagCount(summary: EcosystemSummary): number {
  return (
    summary.release_tags.length ||
    summary.producers.reduce((n, p) => n + p.tags, 0) + summary.unmapped_tags.length
  );
}

export type PipelineLink = { repo: string; anchor: string; label: string; state: ProducerState };

/**
 * Loader repo name (lower-cased; `producers[].packages[]` holds GitHub repo
 * names such as `hoopR` or `sportsdataverse-py`) → the producers that name it,
 * in snapshot order. A plain object so a server page can hand it to client cards.
 */
export function pipelinesByPackage(
  summary: EcosystemSummary | null
): Record<string, PipelineLink[]> {
  const out: Record<string, PipelineLink[]> = {};
  for (const p of summary?.producers ?? []) {
    for (const name of p.packages) {
      const key = name.toLowerCase();
      (out[key] ??= []).push({
        repo: p.repo,
        anchor: producerAnchor(p.repo),
        label: p.label,
        state: p.state,
      });
    }
  }
  return out;
}

/** Shared by the R, Python and Node flagship cards, so never a lookup key on its own. */
const SHARED_TITLE = "sportsdataverse";

/**
 * A package card's key into `pipelinesByPackage`: the repo name at the end of
 * its `sourceHref` (`…/sportsdataverse-py/` → `sportsdataverse-py`; the owner
 * is ignored, e.g. BillPetti/baseballr). Only without a usable `sourceHref`
 * does it fall back to the title, and never to the shared flagship title.
 */
export function packageKey(pkg: { sourceHref?: unknown; title?: unknown }): string | null {
  try {
    const seg = new URL(String(pkg.sourceHref)).pathname.split("/").filter(Boolean).pop();
    const name = seg?.replace(/\.git$/i, "").toLowerCase();
    if (name) return name;
  } catch {
    // no usable sourceHref: fall through to the title
  }
  const title = typeof pkg.title === "string" ? pkg.title.trim().toLowerCase() : "";
  return title && title !== SHARED_TITLE ? title : null;
}

/** The producers behind one package card, or undefined when it reads none. */
export function pipelinesForPackage(
  pipelines: Record<string, PipelineLink[]>,
  pkg: { sourceHref?: unknown; title?: unknown }
): PipelineLink[] | undefined {
  const key = packageKey(pkg);
  return key !== null && Object.hasOwn(pipelines, key) ? pipelines[key] : undefined;
}

/** The release-freshness filter: free text over tag + producer (repo and label), plus an exact producer pick. */
export const UNMAPPED = "__unmapped";
export function matchesReleaseFilter(
  row: { tag: string; producer: string | null; label?: string | null },
  query: string,
  producerPick: string
): boolean {
  if (producerPick === UNMAPPED ? row.producer !== null : producerPick && row.producer !== producerPick)
    return false;
  const hay = `${row.tag} ${row.producer ?? "unmapped"} ${row.label ?? ""}`.toLowerCase();
  return query
    .toLowerCase()
    .split(/\s+/)
    .every((term) => hay.includes(term));
}

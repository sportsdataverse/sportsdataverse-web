# Platform (`/platform`) — setup

The members-only platform area covers five surfaces, all behind the existing
GitHub-OAuth (NextAuth) layer — active **`sportsdataverse`** org members only,
same trust boundary as `/packages/manage`:

| Tab | Source | What it shows |
| --- | --- | --- |
| Automation | GitHub Actions API | Workflow status per tracked repo + manual `workflow_dispatch` |
| Datasets | GitHub Releases API | Release artifacts across the `*-data` repos |
| Models | MongoDB `model_runs` | Training runs: params, metrics, oracle gates, artifacts |
| (Model detail) | MongoDB `model_runs` | Metric trends, gate pass/fail matrix per model |
| Database | MongoDB `db_status` | Postgres heartbeats pushed by the sdv-data droplet |

Design doc: `docs/superpowers/specs/2026-07-11-platform-design.md` (repo root).

## Auth model

- Every `/platform` page and `/api/platform/*` route (GETs included) requires
  an org-member session — the platform is fully private.
- Two ingest endpoints additionally accept a CI bearer token so automation can
  write without a browser session: `POST /api/platform/runs` and
  `POST /api/platform/db-status` with
  `Authorization: Bearer $PLATFORM_INGEST_TOKEN`.
- The tracked repos and the per-repo allowlist of dispatchable workflow files
  live in `content/platform.ts`. A workflow not allowlisted there cannot be
  triggered from the UI, whoever asks.
- `/platform/admin/*` additionally requires the **org owner** role. GitHub
  reports that as `role: "admin"` on the org membership, which `lib/auth.ts`
  puts on the session and `requireAdminApp()` gates on.

### Data API keys

Two ways a `data.sportsdataverse.org` key gets minted, both proxied server-side
with `SDV_KEYS_ADMIN_KEY` (an admin-scoped Data API key — never sent to a
browser):

| path | who | owner comes from |
|---|---|---|
| `/platform/api-key` -> `/api/platform/keys[/rotate]` | any org member | the caller's own session, never request input |
| `/platform/admin/keys` -> `/api/platform/keys/for[/rotate|/revoke]` | org **owners** only | a GitHub login typed into the form |

The delegated path is deliberately *for other people*: it refuses a login that
matches the caller's own (403), and stamps the acting owner into `issued_by` /
`disabled_by` so every key records who created it, for whom, and who ended it.
Recipients do not have to be org members — that is how outside collaborators get
Data API access — and the key shows on their own API key page, which they can
rotate themselves. Only `read` keys are minted this way; `write`/`admin` keys
remain a droplet CLI operation, and revoke refuses them too, so a delegated call
can never disable the platform's own credentials.

Revoke sends the `key_id` **and** the owner it must belong to; the Data API 404s
a mismatch, so a bare id is never enough to disable a key. Rotating someone
else's key hands *you* their new secret — prefer having them rotate it from
their own page whenever they can still sign in.

## Environment variables

Local (`.env.local`) and on Vercel — see `.env.example`:

```
GH_PLATFORM_TOKEN=      # fine-grained PAT: actions:read (+ actions:write for dispatch)
PLATFORM_INGEST_TOKEN=  # openssl rand -hex 32 — shared with CI + the droplet cron
SDV_KEYS_ADMIN_KEY=     # admin-scoped Data API key — mints/rotates user API keys
SDV_DATA_ADMIN_KEY=     # admin-scoped Data API key — /v1/admin observability reads
SDV_TRIGGER_KEY=        # trigger-scoped Data API key — sdv-orch pipeline runs
SDV_DATA_API_URL=       # defaults to https://data.sportsdataverse.org
```

Both are optional-but-recommended: without `GH_PLATFORM_TOKEN` the GitHub tabs
use unauthenticated calls (60 req/h shared quota) and dispatch is disabled;
without `PLATFORM_INGEST_TOKEN` token ingest is disabled (session-only writes).
The `SDV_*` keys likewise fail soft: each route that needs one returns 503 with
the missing variable named, rather than the page breaking.

## Recording a model run from CI / a training script

```sh
curl -sS -X POST "$SDV_PLATFORM_URL/api/platform/runs" \
  -H "Authorization: Bearer $PLATFORM_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d @- << 'JSON'
{
  "model_id": "nfl_ep",
  "sport": "nfl",
  "run_name": "era-retrain 2026-07",
  "status": "completed",
  "params": { "eta": 0.025, "nrounds": 525 },
  "metrics": { "ep_corr_vs_nflfastr": 0.996, "epa_corr": 0.994 },
  "gates": [
    { "name": "ep_corr_vs_nflfastr", "threshold": 0.99, "observed": 0.996,
      "comparison": "gte", "passed": true }
  ],
  "artifacts": [
    { "name": "ep_model.ubj",
      "url": "https://github.com/sportsdataverse/sportsdataverse-data/releases/tag/nfl_model_artifacts" }
  ],
  "git": { "repo": "sportsdataverse/nfl-data", "branch": "main", "sha": "abc123" },
  "tags": ["era-aware"]
}
JSON
```

Python (requests) equivalent — drop it at the end of a training script:

```python
import os, requests

requests.post(
    f"{os.environ['SDV_PLATFORM_URL']}/api/platform/runs",
    headers={"Authorization": f"Bearer {os.environ['PLATFORM_INGEST_TOKEN']}"},
    json={
        "model_id": "cfb_wp",
        "sport": "cfb",
        "status": "completed",
        "metrics": {"brier": 0.041},
        "gates": [{"name": "brier_vs_market", "threshold": 0.05,
                   "observed": 0.041, "comparison": "lte", "passed": True}],
    },
    timeout=30,
).raise_for_status()
```

Validation is zod-side (`lib/platform/schemas.ts`): `model_id` is a lowercase
slug, `metrics` values must be numbers, `gates[].comparison` is `gte`/`lte`,
timestamps are ISO-8601 with offset.

## Database heartbeat from the sdv-data droplet

The site never dials Postgres — the droplet's DB ports stay closed to the
public internet. A daily cron on the droplet pushes a snapshot instead
(anything older than 26 h renders as **stale**).

The canonical heartbeat lives in the **sdv-db** repo as a CLI command
(`sdv_db/heartbeat.py`, run as `uv run sdv-db heartbeat`; `--dry-run` prints
the payload without POSTing). It reports the global stats plus a per-dataset
`datasets[]` array (≤200 entries) the Database tab renders as a freshness
table:

```jsonc
{
  "source": "sdv-db", "ok": true, "host_label": "sdv-data droplet",
  "postgres_version": "17.x", "db_size_bytes": 63350000000,
  "table_count": 79, "row_estimate": 112800000,
  "datasets": [
    { "name": "nfl.pbp", "rows": 1200000,
      "last_updated": "2026-07-11T06:15:00+00:00",   // when it last gained rows
      "latest_row": "game_id=2026_01_KC_BUF (2026-01-13)" }  // newest row identity
  ],
  "collected_at": "2026-07-11T06:15:02+00:00"
}
```

`last_updated` is the max of the table's event/load timestamp column;
`latest_row` is a short human-readable identity of the newest row (key +
event date). On failure the script POSTs
`{"source": "sdv-db", "ok": false, "error": "...", "collected_at": ...}` so an
outage is visible rather than silently stale.

Cron wiring on the droplet:

```sh
# /etc/cron.d/sdv-platform-heartbeat
15 6 * * * sdv cd /opt/sdv-db/python && SDV_PLATFORM_URL=https://sportsdataverse.org \
  PLATFORM_INGEST_TOKEN=<token> uv run sdv-db heartbeat >> /var/log/sdv-heartbeat.log 2>&1
```

## GitHub PAT for the Automation/Datasets tabs

Fine-grained PAT (org: sportsdataverse) with **Actions: read** — plus
**Actions: write** if the dispatch buttons should work. Repository access:
the repos listed in `content/platform.ts`. Set it as `GH_PLATFORM_TOKEN` on
Vercel (server-side only; it is never sent to the browser).

## Adding a repo / workflow / model

- **Repo or workflow allowlist:** edit `content/platform.ts` (a PR — deliberate).
- **Model:** nothing to register — the registry is an aggregation over
  ingested runs; a new `model_id` appears on first POST.

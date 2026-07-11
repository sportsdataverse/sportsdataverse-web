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

## Environment variables

Local (`.env.local`) and on Vercel — see `.env.example`:

```
GH_PLATFORM_TOKEN=      # fine-grained PAT: actions:read (+ actions:write for dispatch)
PLATFORM_INGEST_TOKEN=  # openssl rand -hex 32 — shared with CI + the droplet cron
```

Both are optional-but-recommended: without `GH_PLATFORM_TOKEN` the GitHub tabs
use unauthenticated calls (60 req/h shared quota) and dispatch is disabled;
without `PLATFORM_INGEST_TOKEN` token ingest is disabled (session-only writes).

## Recording a model run from CI / a training script

```sh
curl -sS -X POST "$PROD_URL/api/platform/runs" \
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
(anything older than 26 h renders as **stale**):

```sh
#!/usr/bin/env bash
# /opt/sdv-db/heartbeat.sh — cron: 15 6 * * *
set -euo pipefail
PSQL="psql -U postgres -d sdv -tA"
curl -sS -X POST "$SDV_PLATFORM_URL/api/platform/db-status" \
  -H "Authorization: Bearer $PLATFORM_INGEST_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$(jq -n \
    --arg version "$($PSQL -c 'show server_version')" \
    --argjson size "$($PSQL -c "select pg_database_size('sdv')")" \
    --argjson tables "$($PSQL -c "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')")" \
    --argjson rows "$($PSQL -c "select coalesce(sum(n_live_tup),0) from pg_stat_user_tables")" \
    '{source: "sdv-db", ok: true, host_label: "sdv-data droplet",
      postgres_version: $version, db_size_bytes: $size,
      table_count: $tables, row_estimate: $rows,
      collected_at: (now | todate)}')"
```

Optionally add a `datasets: [{name, rows, last_updated}]` array (≤200 entries)
for per-dataset freshness — the Database tab renders it as a table. On failure,
POST `{"source": "sdv-db", "ok": false, "error": "...", "collected_at": ...}`
so the outage is visible rather than silently stale.

## GitHub PAT for the Automation/Datasets tabs

Fine-grained PAT (org: sportsdataverse) with **Actions: read** — plus
**Actions: write** if the dispatch buttons should work. Repository access:
the repos listed in `content/platform.ts`. Set it as `GH_PLATFORM_TOKEN` on
Vercel (server-side only; it is never sent to the browser).

## Adding a repo / workflow / model

- **Repo or workflow allowlist:** edit `content/platform.ts` (a PR — deliberate).
- **Model:** nothing to register — the registry is an aggregation over
  ingested runs; a new `model_id` appears on first POST.

# App Router Migration + Orchestration Observability Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move sportsdataverse-web (27 pages, 17 API routes) to the Next.js App Router with a dark-first Tailwind v4 + shadcn design system, and surface full Prefect orchestration observability (trigger, DAG, task states, logs, budgets) in `/platform`.

**Architecture:** Two subsystems. Phase 0 extends the sdv-orch FastAPI trigger router with read/cancel proxies over Prefect REST (deployed by restarting `sdv-db-api` on the droplet). Phases 1–7 rebuild the web app under `app/` — route groups `(site)` and `(platform)`, Auth.js v5, MDX via RSC, route handlers with frozen external contracts — migrating page-by-page so every commit builds (each `pages/` file is deleted in the same commit its `app/` replacement lands).

**Tech Stack:** Next 16 (App Router, async `params`), React 19, TypeScript strict, Tailwind v4 (`@theme` CSS-first), shadcn/ui (new-york, RSC), Auth.js v5 (GitHub provider, JWT), next-mdx-remote/rsc, SWR, @xyflow/react (DAG), next-themes, MongoDB + Supabase (unchanged), FastAPI + httpx + Prefect 3.7 REST (Phase 0).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-17-app-router-orchestration-design.md` — re-read §3 (frozen contracts) before touching any API route.
- **External contracts frozen** (paths, methods, params, status codes, auth): `POST /api/platform/db-status` (bearer `PLATFORM_INGEST_TOKEN`), `POST /api/platform/runs` (bearer, zod `modelRunSchema`), `GET /api/platform/datasets/file` (ranged streaming), `GET /api/revalidate?secret=`.
- Conventional Commits. **Never add AI co-author trailers or "Generated with" footers** (commits AND PR bodies). Do not mention Phase/Wave/Plan jargon in commits.
- `tsconfig` strict stays; `npm run tsc && npm run lint && npm run build` must pass at every commit (the per-commit gate).
- Web work happens in `/mnt/sdv_repos/sportsdataverse-web/frontend` on branch `feat/app-router`. sdv-orch work happens in `/mnt/sdv_repos/sdv-orch` on `master` (local-only repo).
- Python: never bare `python`/`pip`; use the venvs (`/mnt/sdv_repos/sdv-orch/.venv/bin/python`; install with `env -u VIRTUAL_ENV /root/.local/bin/uv pip install --python /mnt/sdv_repos/sdv-orch/.venv/bin/python <pkg>` — a stale `$VIRTUAL_ENV` otherwise hijacks the install).
- Env var names do not change (`GITHUB_ID`, `GITHUB_SECRET`, `NEXTAUTH_SECRET`, `PLATFORM_INGEST_TOKEN`, Mongo/Supabase vars). One NEW Vercel env: `SDV_TRIGGER_KEY` (sensitive) + `SDV_DATA_API_URL=https://data.sportsdataverse.org`.
- Never echo secrets (`/etc/sdv-db/sdv-db.env`, `/root/.sdv-orch-trigger-key`, `.env*`). Reference by path.
- If library behavior surprises you (Tailwind v4 syntax, Auth.js v5, next-mdx-remote/rsc, @xyflow/react), verify against current docs via the context7 MCP tools before improvising.

---

## Phase 0 — sdv-orch API extensions (independent subsystem; deploy before web work)

### Task 1: Extend the trigger router with graph / task-runs / logs / limits / cancel

**Files:**
- Modify: `/mnt/sdv_repos/sdv-orch/sdv_orch/api/runs.py`
- Test: `/mnt/sdv_repos/sdv-orch/tests/test_runs_api.py` (new dir)

**Interfaces:**
- Consumes: existing `add_run_routes(app, auth)` contract; Prefect REST at `PREFECT_API_URL` (default `http://127.0.0.1:4200/api`).
- Produces (for Phase 6 UI): `GET /v1/runs?limit&offset&state` → `list[RunRef]`; `GET /v1/runs/{id}` → `RunDetail {run_id, name, state, deployment, parameters, start_time, end_time, total_run_time}`; `GET /v1/runs/{id}/graph` → Prefect graph-v2 passthrough `{nodes, root_node_ids, states, start_time, end_time, artifacts}`; `GET /v1/runs/{id}/task-runs` → `list[TaskRunRef {task_run_id, name, state, start_time, end_time, duration_s, retries}]`; `GET /v1/runs/{id}/logs?limit&offset` → `{logs: list[{ts, level, message}], next_offset}`; `GET /v1/limits` → `list[{tag, limit, active_slots}]`; `POST /v1/runs/{id}/cancel` → `RunRef`.

- [ ] **Step 1: Install pytest into the sdv-orch venv**

```bash
env -u VIRTUAL_ENV /root/.local/bin/uv pip install --python /mnt/sdv_repos/sdv-orch/.venv/bin/python pytest
```
Expected: `Installed 1 package` (or already-satisfied).

- [ ] **Step 2: Write the failing tests**

Create `/mnt/sdv_repos/sdv-orch/tests/__init__.py` (empty) and `/mnt/sdv_repos/sdv-orch/tests/test_runs_api.py`. The tests fake Prefect with `httpx.MockTransport` injected through a new module hook `sdv_orch.api.runs._transport` (added in Step 4) so no server is needed.

```python
"""Trigger-router proxy endpoints against a faked Prefect REST API."""
from __future__ import annotations

import json

import httpx
import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

import sdv_orch.api.runs as runs_mod
from sdv_orch.api.runs import add_run_routes

RID = "11111111-2222-3333-4444-555555555555"


def _fake_prefect(request: httpx.Request) -> httpx.Response:
    path, method = request.url.path, request.method
    if path == f"/flow_runs/{RID}" and method == "GET":
        return httpx.Response(200, json={
            "id": RID, "name": "origami-worm", "deployment_id": "dep-1",
            "parameters": {"sport": "cfb", "start": 2026},
            "state": {"name": "Running", "type": "RUNNING"},
            "start_time": "2026-07-17T21:00:00Z", "end_time": None,
            "total_run_time": 12.5,
        })
    if path == "/flow_runs/filter":
        body = json.loads(request.content)
        assert body["sort"] == "START_TIME_DESC"
        return httpx.Response(200, json=[{
            "id": RID, "name": "origami-worm",
            "state": {"name": "Running", "type": "RUNNING"},
        }])
    if path == f"/flow_runs/{RID}/graph-v2":
        return httpx.Response(200, json={"nodes": [], "root_node_ids": [],
                                         "states": [], "artifacts": [],
                                         "start_time": None, "end_time": None})
    if path == "/task_runs/filter":
        return httpx.Response(200, json=[{
            "id": "t-1", "name": "run_stage-0", "state": {"name": "Completed", "type": "COMPLETED"},
            "start_time": "2026-07-17T21:00:01Z", "end_time": "2026-07-17T21:05:01Z",
            "total_run_time": 300.0, "run_count": 1,
        }])
    if path == "/logs/filter":
        body = json.loads(request.content)
        assert body["logs"]["flow_run_id"]["any_"] == [RID]
        return httpx.Response(200, json=[{
            "timestamp": "2026-07-17T21:00:02Z", "level": 20, "message": "[cfb/raw.scrape] start",
        }])
    if path == "/concurrency_limits/filter":
        return httpx.Response(200, json=[{
            "tag": "stats_nba", "concurrency_limit": 1, "active_slots": ["slot"],
        }])
    if path == f"/flow_runs/{RID}/set_state":
        return httpx.Response(201, json={"state": {"name": "Cancelling", "type": "CANCELLING"}})
    if path == "/deployments/filter":
        return httpx.Response(200, json=[{"id": "dep-1", "name": "run-pipeline"}])
    return httpx.Response(404, json={"detail": f"unexpected {method} {path}"})


@pytest.fixture()
def client(monkeypatch):
    monkeypatch.setattr(runs_mod, "_transport", httpx.MockTransport(_fake_prefect))
    app = FastAPI()
    add_run_routes(app, auth=lambda scope: (lambda: {"scope": scope}))
    return TestClient(app)


def test_run_detail_enriched(client):
    r = client.get(f"/v1/runs/{RID}")
    assert r.status_code == 200
    body = r.json()
    assert body["parameters"] == {"sport": "cfb", "start": 2026}
    assert body["deployment"] == "run-pipeline"
    assert body["state"] == "Running"


def test_graph_passthrough(client):
    r = client.get(f"/v1/runs/{RID}/graph")
    assert r.status_code == 200
    assert set(r.json()) >= {"nodes", "root_node_ids", "states"}


def test_task_runs_shape(client):
    r = client.get(f"/v1/runs/{RID}/task-runs")
    assert r.status_code == 200
    tr = r.json()[0]
    assert tr["name"] == "run_stage-0"
    assert tr["state"] == "Completed"
    assert tr["duration_s"] == 300.0
    assert tr["retries"] == 0          # run_count 1 -> 0 retries


def test_logs_paged(client):
    r = client.get(f"/v1/runs/{RID}/logs?limit=50&offset=0")
    assert r.status_code == 200
    body = r.json()
    assert body["logs"][0]["level"] == "INFO"    # numeric 20 -> name
    assert body["next_offset"] == 1


def test_limits(client):
    r = client.get("/v1/limits")
    assert r.json() == [{"tag": "stats_nba", "limit": 1, "active": 1}]


def test_cancel(client):
    r = client.post(f"/v1/runs/{RID}/cancel")
    assert r.status_code == 200
    assert r.json()["state"] == "Cancelling"


def test_list_accepts_state_filter(client):
    r = client.get("/v1/runs?state=Running&limit=10&offset=0")
    assert r.status_code == 200
    assert r.json()[0]["name"] == "origami-worm"
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
cd /mnt/sdv_repos/sdv-orch && .venv/bin/python -m pytest tests/ -q
```
Expected: FAIL — `AttributeError: module 'sdv_orch.api.runs' has no attribute '_transport'` (and 404s if partially wired).

- [ ] **Step 4: Implement the extensions in `sdv_orch/api/runs.py`**

Add below the existing `PREFECT_API` constant; keep every existing route. New module-level hook + client factory replace the two inline `httpx.AsyncClient(...)` constructions (update `_prefect_create_run`, `get_run`, `list_runs` to use `_client()`):

```python
_transport: httpx.AsyncBaseTransport | None = None  # test seam (MockTransport)

_LEVELS = {50: "CRITICAL", 40: "ERROR", 30: "WARNING", 20: "INFO", 10: "DEBUG"}


def _client() -> httpx.AsyncClient:
    return httpx.AsyncClient(base_url=PREFECT_API, timeout=30, transport=_transport)


class RunDetail(BaseModel):
    run_id: str
    name: str
    state: str
    deployment: str | None = None
    parameters: dict[str, Any] = {}
    start_time: str | None = None
    end_time: str | None = None
    total_run_time: float | None = None


class TaskRunRef(BaseModel):
    task_run_id: str
    name: str
    state: str
    start_time: str | None = None
    end_time: str | None = None
    duration_s: float | None = None
    retries: int = 0


class LogPage(BaseModel):
    logs: list[dict[str, Any]]
    next_offset: int


async def _deployment_names(c: httpx.AsyncClient) -> dict[str, str]:
    r = await c.post("/deployments/filter", json={})
    r.raise_for_status()
    return {d["id"]: d["name"] for d in r.json()}
```

New routes inside `add_run_routes` (same `read_dep` / `trigger_dep` pattern as the existing ones). Replace the existing `get_run` body with the enriched version and extend `list_runs`; add the rest:

```python
    @app.get("/v1/runs/{run_id}", response_model=RunDetail, tags=["runs"])
    async def get_run(run_id: str, key=read_dep) -> RunDetail:
        async with _client() as c:
            r = await c.get(f"/flow_runs/{run_id}")
            if r.status_code == 404:
                raise HTTPException(404, "run not found")
            r.raise_for_status()
            fr = r.json()
            names = await _deployment_names(c) if fr.get("deployment_id") else {}
        return RunDetail(
            run_id=str(fr["id"]), name=fr.get("name", ""), state=_state(fr),
            deployment=names.get(fr.get("deployment_id")),
            parameters=fr.get("parameters") or {},
            start_time=fr.get("start_time"), end_time=fr.get("end_time"),
            total_run_time=fr.get("total_run_time"),
        )

    @app.get("/v1/runs", response_model=list[RunRef], tags=["runs"])
    async def list_runs(limit: int = 25, offset: int = 0,
                        state: str | None = None, key=read_dep) -> list[RunRef]:
        body: dict[str, Any] = {"limit": limit, "offset": offset,
                                "sort": "START_TIME_DESC"}
        if state:
            body["flow_runs"] = {"state": {"name": {"any_": [state]}}}
        async with _client() as c:
            r = await c.post("/flow_runs/filter", json=body)
        r.raise_for_status()
        return [_ref(fr) for fr in r.json()]

    @app.get("/v1/runs/{run_id}/graph", tags=["runs"])
    async def run_graph(run_id: str, key=read_dep) -> dict:
        async with _client() as c:
            r = await c.get(f"/flow_runs/{run_id}/graph-v2")
        if r.status_code == 404:
            raise HTTPException(404, "run not found")
        r.raise_for_status()
        return r.json()

    @app.get("/v1/runs/{run_id}/task-runs", response_model=list[TaskRunRef], tags=["runs"])
    async def run_task_runs(run_id: str, key=read_dep) -> list[TaskRunRef]:
        async with _client() as c:
            r = await c.post("/task_runs/filter", json={
                "flow_runs": {"id": {"any_": [run_id]}},
                "sort": "EXPECTED_START_TIME_ASC", "limit": 200,
            })
        r.raise_for_status()
        return [TaskRunRef(
            task_run_id=str(t["id"]), name=t.get("name", ""), state=_state(t),
            start_time=t.get("start_time"), end_time=t.get("end_time"),
            duration_s=t.get("total_run_time"),
            retries=max(0, (t.get("run_count") or 1) - 1),
        ) for t in r.json()]

    @app.get("/v1/runs/{run_id}/logs", response_model=LogPage, tags=["runs"])
    async def run_logs(run_id: str, limit: int = 200, offset: int = 0,
                       key=read_dep) -> LogPage:
        async with _client() as c:
            r = await c.post("/logs/filter", json={
                "logs": {"flow_run_id": {"any_": [run_id]}},
                "sort": "TIMESTAMP_ASC", "limit": limit, "offset": offset,
            })
        r.raise_for_status()
        rows = r.json()
        return LogPage(
            logs=[{"ts": row["timestamp"],
                   "level": _LEVELS.get(row.get("level", 20), str(row.get("level"))),
                   "message": row.get("message", "")} for row in rows],
            next_offset=offset + len(rows),
        )

    @app.get("/v1/limits", tags=["runs"])
    async def limits(key=read_dep) -> list[dict]:
        async with _client() as c:
            r = await c.post("/concurrency_limits/filter", json={})
        r.raise_for_status()
        return [{"tag": x["tag"], "limit": x["concurrency_limit"],
                 "active": len(x.get("active_slots") or [])} for x in r.json()]

    @app.post("/v1/runs/{run_id}/cancel", response_model=RunRef, tags=["runs"])
    async def cancel_run(run_id: str, key=trigger_dep) -> RunRef:
        async with _client() as c:
            r = await c.post(f"/flow_runs/{run_id}/set_state",
                             json={"state": {"type": "CANCELLING"}})
        if r.status_code == 404:
            raise HTTPException(404, "run not found")
        r.raise_for_status()
        st = r.json().get("state") or {}
        return RunRef(run_id=run_id, state=st.get("name") or st.get("type", ""), name="")
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd /mnt/sdv_repos/sdv-orch && .venv/bin/python -m pytest tests/ -q
```
Expected: `7 passed` (or 8 with the list test) — all green.

- [ ] **Step 6: Commit**

```bash
cd /mnt/sdv_repos/sdv-orch && git add sdv_orch/api/runs.py tests/ && git -c user.name="Saiem Gilani" -c user.email="saiem.gilani@sportsdataverse.org" commit -m "feat(api): graph, task-run, log, limit, and cancel proxies for the run UI"
```

### Task 2: Deploy + live-verify the extended router

**Files:**
- Modify: none (systemd restart + live checks)

**Interfaces:**
- Consumes: Task 1 endpoints; trigger key at `/root/.sdv-orch-trigger-key`.
- Produces: live `https://data.sportsdataverse.org/v1/...` surface the Vercel preview will hit.

- [ ] **Step 1: Restart the mounted API and confirm health**

```bash
systemctl restart sdv-db-api.service && sleep 3 || true
/mnt/sdv_repos/sdv-orch/.venv/bin/python -c "
import httpx; print(httpx.get('http://127.0.0.1:8000/health', timeout=10).json())"
```
Expected: `{'status': 'ok', ...}`. (The Bash tool blocks `sleep`; poll with httpx retries instead if needed.)

- [ ] **Step 2: Live-verify each new endpoint with the trigger key**

Use the safe-test trick: `systemctl stop sdv-orch-flows`, POST a run (stays Scheduled), then GET `/v1/runs/{id}`, `/graph`, `/task-runs`, `/logs`, `/v1/limits`, POST `/cancel`, then `systemctl start sdv-orch-flows`. Read the token in Python from `/root/.sdv-orch-trigger-key` — never echo it. Every endpoint: expect 200 (cancel: 200, state Cancelling/Cancelled; graph/task-runs/logs may be empty lists for a never-executed run — that is a PASS).

- [ ] **Step 3: Commit nothing; record**

No repo change. Note the verified run id in the task log for Phase 6 testing.

---
## Phase 1 — Web tooling foundation (repo: sportsdataverse-web/frontend, branch feat/app-router)

### Task 3: Dependency + Tailwind v4 + shadcn groundwork

**Files:**
- Modify: `package.json`, `postcss.config.js`, `components.json`, `styles/globals.css`
- Delete: `tailwind.config.js` (theme moves into CSS `@theme`)
- Create: none yet

**Interfaces:**
- Produces: Tailwind v4 build with the token set every later task's classNames rely on (`bg-background`, `text-muted-foreground`, `status-*` colors, `font-display/mono` etc.); shadcn CLI configured `rsc: true`.

- [ ] **Step 1: Install/upgrade deps**

```bash
cd /mnt/sdv_repos/sportsdataverse-web/frontend
npm i tailwindcss@^4 @tailwindcss/postcss@^4 @tailwindcss/typography@latest next-themes nextjs-toploader sonner @xyflow/react @tanstack/react-table
npm i next-auth@beta        # Auth.js v5 — check `npm dist-tag ls next-auth`; use the 5.x line
npm rm nextjs-google-analytics nprogress @types/nprogress tailwindcss-animate
```
Expected: clean install, lockfile updated. (If `next-auth@beta` resolves <5, stop and check the dist-tags — v5 is required.)

- [ ] **Step 2: Switch PostCSS to the v4 plugin**

`postcss.config.js`:
```js
module.exports = { plugins: { "@tailwindcss/postcss": {} } };
```

- [ ] **Step 3: Rewrite `styles/globals.css` as the v4 token source**

Replace the `@tailwind` directives + `:root` blocks with (keep the Avengero `@font-face` block as-is at the bottom):

```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@custom-variant dark (&:is(.dark *));

@theme {
  /* type */
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, sans-serif;
  --font-display: var(--font-barlow), var(--font-inter), sans-serif;
  --font-script: var(--font-sarina), cursive;
  --font-mono: ui-monospace, "SFMono-Regular", Menlo, monospace;

  /* brand */
  --color-brand-300: #67c3e8;
  --color-brand-400: #22a5d4;
  --color-brand-500: #0580ad;   /* SDV accent */
  --color-brand-600: #02679c;
  --color-brand-700: #024f84;   /* legacy primary */

  /* status ramp (shared: workflows, freshness, run states) */
  --color-status-success: #10b981;  /* emerald-500 */
  --color-status-running: #f59e0b;  /* amber-500  */
  --color-status-failed:  #f43f5e;  /* rose-500   */
  --color-status-scheduled: #38bdf8;/* sky-400    */
  --color-status-cancelled: #a1a1aa;/* zinc-400   */

  --radius: 0.5rem;
  --breakpoint-xs: 30rem;
  --breakpoint-3xl: 125rem;
}

/* shadcn semantic tokens — dark-first values in .dark, light in :root */
:root {
  --background: 0 0% 100%;
  --foreground: 222 47% 11%;
  --card: 0 0% 100%;
  --card-foreground: 222 47% 11%;
  --popover: 0 0% 100%;
  --popover-foreground: 222 47% 11%;
  --primary: 205 96% 26%;
  --primary-foreground: 210 40% 98%;
  --secondary: 210 40% 96%;
  --secondary-foreground: 222 47% 11%;
  --muted: 210 40% 96%;
  --muted-foreground: 215 16% 47%;
  --accent: 196 94% 35%;
  --accent-foreground: 210 40% 98%;
  --destructive: 350 89% 60%;
  --destructive-foreground: 210 40% 98%;
  --border: 214 32% 91%;
  --input: 214 32% 91%;
  --ring: 199 92% 62%;
}
.dark {
  --background: 222 18% 7%;
  --foreground: 210 20% 96%;
  --card: 222 16% 10%;
  --card-foreground: 210 20% 96%;
  --popover: 222 16% 9%;
  --popover-foreground: 210 20% 96%;
  --primary: 199 92% 62%;
  --primary-foreground: 222 47% 8%;
  --secondary: 220 14% 15%;
  --secondary-foreground: 210 20% 96%;
  --muted: 220 14% 14%;
  --muted-foreground: 218 11% 65%;
  --accent: 196 94% 43%;
  --accent-foreground: 210 20% 98%;
  --destructive: 350 89% 60%;
  --destructive-foreground: 210 20% 98%;
  --border: 220 13% 18%;
  --input: 220 13% 18%;
  --ring: 199 92% 62%;
}

@theme inline {
  --color-background: hsl(var(--background));
  --color-foreground: hsl(var(--foreground));
  --color-card: hsl(var(--card));
  --color-card-foreground: hsl(var(--card-foreground));
  --color-popover: hsl(var(--popover));
  --color-popover-foreground: hsl(var(--popover-foreground));
  --color-primary: hsl(var(--primary));
  --color-primary-foreground: hsl(var(--primary-foreground));
  --color-secondary: hsl(var(--secondary));
  --color-secondary-foreground: hsl(var(--secondary-foreground));
  --color-muted: hsl(var(--muted));
  --color-muted-foreground: hsl(var(--muted-foreground));
  --color-accent: hsl(var(--accent));
  --color-accent-foreground: hsl(var(--accent-foreground));
  --color-destructive: hsl(var(--destructive));
  --color-destructive-foreground: hsl(var(--destructive-foreground));
  --color-border: hsl(var(--border));
  --color-input: hsl(var(--input));
  --color-ring: hsl(var(--ring));
  /* legacy aliases kept until Phase 7 cleanup */
  --color-darkPrimary: #303338;
  --color-darkSecondary: #23272b;
  --color-darkWhite: #f2f5fa;
}

@layer base {
  * { border-color: hsl(var(--border)); }
  body { @apply bg-background text-foreground font-sans antialiased; }
}
```

- [ ] **Step 4: Delete `tailwind.config.js`; update `components.json`**

`components.json`: set `"rsc": true`, `"tailwind": { "config": "", "css": "styles/globals.css", "baseColor": "slate", "cssVariables": true }` (empty config string = v4 CSS-first). Keep aliases.

- [ ] **Step 5: Add shadcn primitives**

```bash
npx shadcn@latest add table tabs dialog sheet dropdown-menu select input badge skeleton tooltip command separator scroll-area
```
Expected: components appear under `components/ui/`. (`button`, `card` already exist — allow overwrite so they pick up v4 tokens.)

- [ ] **Step 6: Build gate + commit**

The Pages Router build must still pass on tw4 tokens (legacy aliases cover old classNames; fix any survivors it reports).
```bash
npm run tsc && npm run build
git add -A frontend/package.json frontend/package-lock.json frontend/postcss.config.js frontend/components.json frontend/styles/globals.css frontend/components/ui && git rm -q frontend/tailwind.config.js
git -c user.name="Saiem Gilani" -c user.email="saiem.gilani@sportsdataverse.org" commit -m "build: tailwind v4 css-first tokens + shadcn primitives"
```
(Run git from the repo root `/mnt/sdv_repos/sportsdataverse-web`; paths above are repo-relative.)

## Phase 2 — Auth.js v5

### Task 4: Port auth to v5 and adapt the platform gates

**Files:**
- Modify: `lib/auth.ts`, `lib/platform/auth.ts`, `types/` (session augmentation file — find with `grep -rn "isOrgMember" types/ global.d.ts`)
- Create: `app/api/auth/[...nextauth]/route.ts`
- Delete: `pages/api/auth/[...nextauth].ts` (same commit)

**Interfaces:**
- Produces: `auth()` (server session), `handlers`, `signIn`, `signOut` from `@lib/auth`; `requireMember()` for route handlers returning `{session} | NextResponse(401)`; `checkIngestToken(req: Request)` unchanged semantics. Session shape keeps `login`, `isOrgMember`, `role`.

- [ ] **Step 1: Rewrite `lib/auth.ts`**

Port the existing v4 `authOptions` 1:1 into:

```ts
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

const SDV_ORG = "sportsdataverse";
const MEMBERSHIP_TTL_MS = 30 * 60 * 1000;

// (copy the existing membership-fetch helper from the v4 file verbatim)

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID!,
      clientSecret: process.env.GITHUB_SECRET!,
      authorization: { params: { scope: "read:user read:org" } },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    // jwt + session callbacks: copy the v4 bodies verbatim — the org-membership
    // resolution, TTL revalidation, and login/isOrgMember/role exposure are
    // framework-version-independent. Only the surrounding types change.
  },
});
```
Keep the v4 file's helper functions and callback logic byte-similar; only the wrapper changes. Augment `Session`/`JWT` types in the existing types file for v5 module paths (`next-auth` and `next-auth/jwt`).

- [ ] **Step 2: Route handler + delete the pages route**

`app/api/auth/[...nextauth]/route.ts`:
```ts
import { handlers } from "@lib/auth";
export const { GET, POST } = handlers;
```
`git rm frontend/pages/api/auth/[...nextauth].ts` in the same commit (route collision otherwise).

- [ ] **Step 3: Adapt `lib/platform/auth.ts`**

```ts
import { NextResponse } from "next/server";
import { auth } from "@lib/auth";

export async function requireMember() {
  const session = await auth();
  if (!session?.isOrgMember) {
    return { session: null, deny: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  }
  return { session, deny: null };
}
// checkIngestToken: change the signature from (req: NextApiRequest) to
// (authorizationHeader: string | null) so both route handlers and any legacy
// callers can use it; keep the timing-safe comparison body identical.
```
`getPlatformSessionProps` (gSSP-only) is deleted — the platform layout takes over (Task 7). Keep it until Phase 5 removes the last consumer, then delete in that commit.

- [ ] **Step 4: Gate + commit**

```bash
npm run tsc && npm run build
```
Expected: both pass — pages still consume `getServerSession`? No: v5 removes it. Any `getServerSession(authOptions)` callers in `pages/api/*` still live at this point — replace those call sites now with `const session = await auth()` (v5's `auth()` works in pages API routes too). `grep -rn "getServerSession\|authOptions" frontend/pages frontend/lib` must return zero rows before committing.
```bash
git add -A frontend/lib/auth.ts frontend/lib/platform/auth.ts frontend/app/api/auth frontend/types && git rm -q "frontend/pages/api/auth/[...nextauth].ts"
git -c user.name="Saiem Gilani" -c user.email="saiem.gilani@sportsdataverse.org" commit -m "feat(auth): port to auth.js v5 with org-membership jwt intact"
```
Sign-in cannot be fully tested headless — the Vercel preview validates it; local `npm run dev` + hitting `/api/auth/signin` should render the provider page (200) as a smoke check.

---
## Phase 3 — App skeleton, providers, root layout

### Task 5: Root layout, providers, metadata, top-loader

**Files:**
- Create: `app/layout.tsx`, `app/providers.tsx`, `app/globals.css` (re-export), `app/not-found.tsx`, `app/error.tsx`, `lib/fonts.ts`, `lib/metadata.ts`
- Modify: `next.config.ts` (only if MDX plugin needed at config level — it is not; skip)

**Interfaces:**
- Consumes: `SessionProvider` (v5 `next-auth/react` client re-export), `ThemeProvider` (next-themes).
- Produces: `<Providers>` client wrapper; font CSS vars (`--font-inter/-barlow/-sarina`); `baseMetadata` for `generateMetadata` reuse. Route groups mount under this layout.

- [ ] **Step 1: `lib/fonts.ts`** — move the three `localFont` definitions out of the old `_app.tsx` verbatim (Inter var, Barlow 5 weights, Sarina), exporting `inter`, `barlow`, `sarina`.

- [ ] **Step 2: `app/providers.tsx`** (client):

```tsx
"use client";
import { SessionProvider } from "next-auth/react";
import { ThemeProvider } from "next-themes";
import PlausibleProvider from "next-plausible";
import NextTopLoader from "nextjs-toploader";
import { Toaster } from "@components/ui/sonner";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <PlausibleProvider domain="sportsdataverse.org">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <NextTopLoader color="hsl(var(--primary))" showSpinner={false} />
          {children}
          <Toaster richColors position="top-right" />
        </ThemeProvider>
      </PlausibleProvider>
    </SessionProvider>
  );
}
```

- [ ] **Step 3: `app/layout.tsx`** (server):

```tsx
import "@styles/globals.css";
import type { Metadata } from "next";
import { inter, barlow, sarina } from "@lib/fonts";
import { Providers } from "./providers";
import { baseMetadata } from "@lib/metadata";

export const metadata: Metadata = baseMetadata;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning
      className={`${inter.variable} ${barlow.variable} ${sarina.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 4: `lib/metadata.ts`** — port the defaults from the old `MetaData` component into a `baseMetadata: Metadata` object (title template `%s · SportsDataverse`, description, openGraph, twitter, metadataBase from `content/meta`). Add `app/not-found.tsx` and `app/error.tsx` ("use client") with styled fallbacks.

- [ ] **Step 5: Build gate + commit** — `app/` and `pages/` coexist now (Next allows it); `pages/index.tsx` still owns `/` until Task 6, so no collision yet.
```bash
npm run tsc && npm run build
git add -A frontend/app frontend/lib/fonts.ts frontend/lib/metadata.ts
git -c user.name="Saiem Gilani" -c user.email="saiem.gilani@sportsdataverse.org" commit -m "feat(app): root layout, providers, metadata, top-loader"
```

## Phase 4 — Public site `(site)` route group

### Task 6: Migrate marketing + MDX pages, delete their pages/ equivalents

**Files:**
- Create: `app/(site)/layout.tsx`, `app/(site)/page.tsx`, `app/(site)/about/page.tsx`, `app/(site)/privacy/page.tsx`, `app/(site)/blog/page.tsx`, `app/(site)/blog/[slug]/page.tsx`, `app/(site)/snippets/page.tsx`, `app/(site)/snippets/[slug]/page.tsx`, `app/(site)/projects/page.tsx`, `app/(site)/projects/manage/page.tsx`, `app/(site)/packages/page.tsx`, `app/(site)/packages/manage/page.tsx`, `app/(site)/stats/page.tsx`, `components/mdx/MdxRenderer.tsx`, `app/feed.xml/route.ts`, `app/sitemap.ts`, `app/robots.ts`
- Modify: `lib/MDXContent.ts` (add a `getRawSource(slug)` returning frontmatter + raw body string)
- Delete (same commits): the corresponding `pages/*.tsx` files

**Interfaces:**
- Consumes: `MDXContent` class, `MDXComponents`, `@layout/Layout` (nav/footer — port into `(site)/layout.tsx`).
- Produces: static `(site)` pages with `generateStaticParams` + `generateMetadata`.

- [ ] **Step 1: `components/mdx/MdxRenderer.tsx`** — server component wrapping `next-mdx-remote/rsc` `<MDXRemote source={...} components={mdxComponents} options={{ mdxOptions: { rehypePlugins: [rehypeSlug, [rehypeAutolinkHeadings], [rehypePrettyCode, { theme: "one-dark-pro" }]] } }} />`. Interactive `MDXComponents` get `"use client"`; static ones stay server. **Verify one blog post renders with code highlighting before porting the rest** (spec risk item).

- [ ] **Step 2: `(site)/layout.tsx`** — port `@layout/Layout` (site nav + footer) as a server component; restyle nav/footer to the new tokens (dark-first, editorial). Nav becomes a client island only for the mobile menu + theme toggle.

- [ ] **Step 3: Blog** — `blog/[slug]/page.tsx` with `generateStaticParams` (from `MDXContent("posts").getSlugs()`), `generateMetadata` (frontmatter), server render via `MdxRenderer`, keep the view-counter island (client, posts a view). `blog/page.tsx` = index list, restyled post cards. Delete `pages/blog/[slug].tsx` + `pages/blog/index.tsx` in this commit.

- [ ] **Step 4: Snippets, about, privacy** — same pattern; `static_pages/*.mdx` for about/privacy. Delete their `pages/*` in-commit.

- [ ] **Step 5: Home, stats, projects(+manage), packages(+manage)** — home + stats are SSG/SWR; projects/packages `manage` pages are client-heavy CRUD (auth-gated) — port as client components calling the (unchanged) `/api/projects` + `/api/packages` route handlers (those move in Task 8, so until then they still hit the pages/api versions — order Task 8 before deleting pages/api, but pages/*.tsx frontends can move now since both routers coexist). Delete each `pages/*.tsx` as its `app/` version lands.

- [ ] **Step 6: `feed.xml`, `sitemap.ts`, `robots.ts`** — route handler + conventions reusing `lib/sitemap.ts`. Preserve `vercel.json` redirects (`/rss→/feed.xml`, `/sitemap→/sitemap.xml`).

- [ ] **Step 7: Build gate + commit(s)** — commit per logical group (blog, snippets+static, home+stats, projects+packages). Each: `npm run tsc && npm run build` green, then commit. Example:
```bash
npm run build && git add -A frontend/app/\(site\)/blog frontend/components/mdx frontend/lib/MDXContent.ts && git rm -q frontend/pages/blog/\[slug\].tsx frontend/pages/blog/index.tsx
git -c user.name="Saiem Gilani" -c user.email="saiem.gilani@sportsdataverse.org" commit -m "feat(site): migrate blog to app router with rsc mdx"
```

## Phase 5 — Platform `(platform)` route group + API route handlers

### Task 7: Platform shell layout with server-side auth gate

**Files:**
- Create: `app/(platform)/layout.tsx`, `components/platform/PlatformSidebar.tsx`, `components/platform/PlatformTopbar.tsx`, `components/platform/CommandMenu.tsx`, `components/platform/SignInGate.tsx`
- Modify: `components/platform/PlatformShell.tsx` (keep `StatusBadge`, `timeAgo` exports; the layout supersedes the wrapper)

**Interfaces:**
- Consumes: `auth()` from `@lib/auth`.
- Produces: authenticated platform chrome; unauthorized users see `SignInGate`. `StatusBadge(status)` + `timeAgo(date)` reused everywhere (move to `lib/platform/format.ts` if cleaner).

- [ ] **Step 1: `(platform)/layout.tsx`** (server) — `const session = await auth(); if (!session?.isOrgMember) return <SignInGate signedIn={!!session} />;` else render sidebar rail + topbar + `{children}`. Icon-rail sidebar (lucide) links: Overview, Automation, Datasets, Explore, Lookups, WinProb, Trends, Models, Database. Topbar: breadcrumb, ⌘K trigger, theme toggle, user menu (signOut).
- [ ] **Step 2: `CommandMenu.tsx`** (client, shadcn `command`) — ⌘K palette listing platform pages + (Task 9) pipelines + recent runs.
- [ ] **Step 3: Restyle `StatusBadge`** to the status-ramp tokens (success/running/failed/scheduled/cancelled). Build gate + commit.

### Task 8: Port the 16 remaining API routes to route handlers

**Files:**
- Create: `app/api/**/route.ts` for each (mirror existing paths exactly)
- Delete: every `pages/api/**` file except auth (done in Task 4), same commits
- Modify: none of the data-layer libs (`lib/platform/*`, `lib/supabase.ts`, Mongo layers) — reused verbatim

**Interfaces:**
- Consumes: existing data-layer functions; `requireMember()`, `checkIngestToken()` from Task 4.
- Produces: identical external HTTP surface (see Global Constraints frozen list).

- [ ] **Step 1: Frozen-contract routes FIRST** — `platform/db-status`, `platform/runs`, `platform/runs/[id]`, `platform/datasets/file` (ranged stream — use `Response` with `ReadableStream` + `Content-Range`/`Accept-Ranges` headers; test a `Range:` request returns 206), `revalidate` (use `revalidatePath`/`revalidateTag`). Each handler: `export async function GET/POST(req: Request)`, read body via `await req.json()`, auth via `checkIngestToken(req.headers.get("authorization"))` or `requireMember()`. Verify with curl against `npm run dev` that db-status POST with the bearer token returns the same status code as before.
- [ ] **Step 2: Remaining platform routes** — `automation`, `bookmarks`, `datasets/assets`. 
- [ ] **Step 3: Public/util routes** — `ga`, `mailchimp`, `newsletter`, `packages`, `projects`, `stats/github`, `views/[slug]`, `views/index`. Convert `req.query`→`URL` searchParams, `res.json`→`Response.json`, status via `{ status }`.
- [ ] **Step 4: Delete `pages/api/` wholesale** once all handlers exist; `grep -rn "NextApiRequest\|NextApiResponse" frontend/pages frontend/app` returns zero. Build gate + commit per group.

### Task 9: Migrate the platform pages (non-orchestration)

**Files:**
- Create: `app/(platform)/platform/{page,automation/page,database/page,datasets/page,explore/page,lookups/page,trends/page,wp/page,models/page,models/[modelId]/page,runs/[id]/page}.tsx`
- Delete: `pages/platform/*` equivalents (same commits)

**Interfaces:**
- Consumes: platform route handlers (Task 8), `requireMember` via layout.
- Produces: the platform pages, minus the new Pipelines UI (Task 11).

- [ ] **Step 1:** Port each page: server component fetches initial data (was `getServerSideProps`); live-refresh pages (`automation`, `explore`, `trends`, `wp`) keep a client SWR island. Drop the `platformSession` prop entirely — auth is the layout's job. duckdb (`explore`) stays `next/dynamic` client-only.
- [ ] **Step 2:** `runs/[id]/page.tsx` (model runs, Mongo) — server fetch `getRun(id)`, render restyled tables; async `params` (`{ params }: { params: Promise<{ id: string }> }` → `const { id } = await params`).
- [ ] **Step 3:** Restyle each to new tokens (dense tables, mono values, status badges). Build gate + commit per page group.

## Phase 6 — Orchestration observability UI

### Task 10: Orchestration proxy handlers + typed client

**Files:**
- Create: `app/api/platform/orch/pipelines/route.ts`, `app/api/platform/orch/runs/route.ts`, `app/api/platform/orch/runs/[id]/route.ts`, `.../[id]/graph/route.ts`, `.../[id]/task-runs/route.ts`, `.../[id]/logs/route.ts`, `.../[id]/cancel/route.ts`, `app/api/platform/orch/limits/route.ts`, `lib/platform/orch.ts` (typed fetch client + TS types mirroring Task 1 shapes)
- Modify: none

**Interfaces:**
- Consumes: `requireMember()`; `process.env.SDV_DATA_API_URL`, `process.env.SDV_TRIGGER_KEY`.
- Produces: `lib/platform/orch.ts` types (`Pipeline`, `RunRef`, `RunDetail`, `TaskRun`, `LogLine`, `Limit`) + client used by pages.

- [ ] **Step 1:** `lib/platform/orch.ts` — a `dataApi(path, init?)` helper injecting `Authorization: Bearer ${SDV_TRIGGER_KEY}` server-side; TS interfaces matching Task 1's Pydantic models exactly (`RunDetail.total_run_time` etc.).
- [ ] **Step 2:** Each proxy handler: `const { deny } = await requireMember(); if (deny) return deny;` then forward to `dataApi(...)`. Read endpoints GET; `runs` POST (trigger) and `runs/[id]/cancel` POST. Cache: `no-store` for run/logs/graph; `revalidate: 60` for pipelines/limits. GET `logs` forwards `limit`/`offset` searchParams.
- [ ] **Step 3:** Build gate + commit.

### Task 11: Pipelines tab (trigger + budgets + recent runs)

**Files:**
- Create: `components/platform/orch/PipelineCards.tsx`, `TriggerForm.tsx`, `BudgetBadges.tsx`, `RunsTable.tsx`, `RunStateChip.tsx`
- Modify: `app/(platform)/platform/automation/page.tsx` (add shadcn `tabs`: "GitHub Workflows" | "Pipelines")

**Interfaces:**
- Consumes: `lib/platform/orch.ts` client via `/api/platform/orch/*` (SWR).
- Produces: `RunStateChip({state})` reused by Task 12.

- [ ] **Step 1:** `RunStateChip` maps state→status-ramp color (Completed=success, Running/Pending=running, Failed/Crashed=failed, Scheduled=scheduled, Cancelled=cancelled).
- [ ] **Step 2:** `TriggerForm` (client) — sport `select` (from `/orch/pipelines`), start/end season, stages multi-select, rescrape + backfill toggles; submits to `POST /orch/runs`; on success `toast` + router.push to the run detail. `BudgetBadges` from `/orch/limits` (`stats_nba 1/1`). `PipelineCards` renders registry pipelines.
- [ ] **Step 3:** `RunsTable` — SWR `/orch/runs?limit=25`, `refreshInterval` 5000 while any row non-terminal else 60000; columns state chip / sport / deployment / started (`timeAgo`) / duration; row → run detail. Add both tabs to `automation/page.tsx`. Build gate + commit.

### Task 12: Pipeline run detail — DAG canvas, tasks, logs

**Files:**
- Create: `app/(platform)/platform/pipelines/runs/[id]/page.tsx`, `components/platform/orch/RunHeader.tsx`, `DagCanvas.tsx`, `TaskTable.tsx`, `LogViewer.tsx`, `lib/platform/dag.ts` (graph-v2 + registry-fallback → react-flow nodes/edges)
- Modify: `components/platform/CommandMenu.tsx` (add recent runs)

**Interfaces:**
- Consumes: `/api/platform/orch/runs/[id]{,/graph,/task-runs,/logs}`; `@xyflow/react`; `RunStateChip`.
- Produces: the run observability page.

- [ ] **Step 1:** `lib/platform/dag.ts` — `toFlow(graph, pipeline?)`: map graph-v2 `nodes`+`states` to react-flow nodes (state color, label, duration) and edges; when the run has no task graph yet (Scheduled), fall back to the pipeline's declared stage chain from `/orch/pipelines` rendered as scheduled nodes. Unit-test the fallback mapping with a fixture (`components`-free pure function; `test_dag` in `frontend`—use `npm run tsc` + a vitest-free assertion script or a minimal `*.test.ts` if a runner exists; otherwise a `demo()` asserting node count). Ponytail: keep it a pure function so it needs no React to test.
- [ ] **Step 2:** `RunHeader` (name, `RunStateChip`, deployment, params, started/duration, Cancel button → `POST /orch/runs/[id]/cancel` while active). `DagCanvas` (client, `@xyflow/react`, fit-view, read-only, node color = state). `TaskTable` (shadcn table). `LogViewer` (client) — mono, `scroll-area`, level filter, follow-tail toggle, SWR poll `/logs?offset=` 5s until terminal, append by `next_offset`.
- [ ] **Step 3:** `pipelines/runs/[id]/page.tsx` — server fetch initial run + graph, hydrate client islands. Add recent runs to ⌘K. Build gate + commit.

## Phase 7 — Cleanup, docs, verification

### Task 13: Remove legacy, add SSH-tunnel doc, final verification

**Files:**
- Delete: `pages/` (should be empty of routes now — confirm), `components/MetaData` if unused, legacy color aliases in `globals.css` (`darkPrimary` etc.), `context/darkModeContext` (replaced by next-themes)
- Create: `docs/platform/prefect-access.md` (SSH tunnel), append to `/mnt/sdv_repos/sdv-orch/README.md`
- Modify: `_app.tsx`/`_document.tsx` — delete

**Interfaces:** none new.

- [ ] **Step 1:** `grep -rn "darkModeContext\|MetaData\|next/head\|getServerSideProps\|getStaticProps" frontend/app frontend/components` → zero (all migrated). Delete `pages/_app.tsx`, `pages/_document.tsx`, `pages/404.tsx` (→ `app/not-found.tsx`), `context/darkModeContext`, unused legacy tokens.
- [ ] **Step 2:** SSH-tunnel doc: `ssh -L 4200:127.0.0.1:4200 root@sdv-data` → `http://localhost:4200`; note it never exposes Prefect publicly. Add to both docs.
- [ ] **Step 3:** Full gate on the droplet:
```bash
cd /mnt/sdv_repos/sportsdataverse-web/frontend && npm run tsc && npm run lint && npm run build
```
Expected: all pass; `pages/` contains no routes.
- [ ] **Step 4:** Commit; push `feat/app-router`; open PR → **Vercel preview**. On the preview verify: org-member sign-in, a blog post (code highlighting), automation both tabs, trigger a real pipeline, watch DAG + logs, cancel. Post-merge: confirm heartbeat POST still 200 (next timer), model-run ingest via curl, `data.sportsdataverse.org` unaffected.

```bash
cd /mnt/sdv_repos/sportsdataverse-web && git add -A && git -c user.name="Saiem Gilani" -c user.email="saiem.gilani@sportsdataverse.org" commit -m "chore(web): remove pages router legacy; add prefect access doc"
git push -u origin feat/app-router
```
Open the PR with `gh pr create` (no AI trailers in the body).

---

## Self-review notes

- **Spec §1 routing** → Tasks 5–9, 13. **§2 auth** → Task 4. **§3 frozen contracts** → Task 8 Step 1 (contracts listed in Global Constraints, ported first, curl-verified). **§4 design system** → Task 3 + restyle steps in 6/7/9. **§5 orchestration** → Phase 0 (API) + Tasks 10–12 (proxy+UI); all seven Prefect endpoints from §5a map to Task 1's produced routes; §5c UI maps to Tasks 11–12; SSH tunnel → Task 13. **§6 rollout** → phase ordering (Phase 0 deploys before the preview) + Task 13 Step 4. **§7 risks** → called out inline (MDX rsc verify Task 6.1; Auth.js Task 4.4; tw3→4 Task 3; duckdb Task 6.5/9.1; ranged download Task 8.1).
- **Types consistent:** `RunDetail`/`TaskRunRef`/`LogPage` defined Task 1, mirrored in `lib/platform/orch.ts` Task 10, consumed Tasks 11–12. `requireMember()` returns `{session, deny}` (Task 4) — used that shape in Tasks 8 & 10. `RunStateChip` defined Task 11, reused Task 12.
- **No placeholders:** every code step carries real code; restyle steps name exact tokens; the one non-code area (Auth.js callback bodies) explicitly says "copy v4 verbatim" because the source exists in-repo.
- **Ponytail flags:** `dag.ts` kept a pure function for a runner-free test; no chart lib added beyond react-flow (the one genuinely needed dependency); shadcn primitives added only as consumed.

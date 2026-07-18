# Prefect UI access (orchestration deep-dive)

The `/platform` Automation → Pipelines area covers day-to-day orchestration
(trigger, DAG, task states, logs, budgets) through the Data API. For the full
native Prefect dashboard (flow-run timelines, concurrency admin, deployment
schedules), tunnel to the droplet — the Prefect server binds to localhost only
and is **never** exposed publicly:

```sh
ssh -L 4200:127.0.0.1:4200 root@sdv-data   # 161.35.59.239
# then open http://localhost:4200
```

Server-side pieces on the droplet (all systemd):

| Unit | What |
|---|---|
| `sdv-orch-prefect.service` | Prefect server (state in `/mnt/sdv_repos/sdv-orch/prefect-home/`) |
| `sdv-orch-flows.service` | Serves the `run-pipeline` + `backfill` deployments |
| `sdv-db-api.service` | Data API; mounts the sdv-orch trigger router via `PYTHONPATH` drop-in |

Safe testing trick: `systemctl stop sdv-orch-flows` parks triggered runs in
`Scheduled` (the server holds state; only the flows service executes), so the
whole trigger→observe→cancel path can be exercised without running a scrape.

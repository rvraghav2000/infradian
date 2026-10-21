# Runbook: inventory-api

## Availability
Alerts: `InventoryAvailabilityBurnFast` (page), `InventoryAvailabilityBurnSlow` (ticket), `InventoryDown`.
1. `python tools/pod_doctor.py -n inventory` — what's unhealthy and why?
2. Recent deploy? `argocd app history inventory-api` / `git log gitops/values`. If yes → `git revert` the deploy commit (ArgoCD rolls back).
3. `/readyz` failing → Postgres problem: `kubectl -n inventory logs sts/inventory-api-postgres`.
4. Pods CrashLooping → `kubectl -n inventory logs <pod> --previous`.

## Latency
Alert: `InventoryLatencyP95High`.
1. Grafana "inventory-api — SLOs": is request rate up (load) or flat (slow dependency)?
2. Check Postgres CPU/connections; the app caps its pool via `dbMaxOpenConns`.
3. Mitigate: scale replicas in `gitops/values/inventory-api.yaml`, or shed load.

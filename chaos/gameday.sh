#!/usr/bin/env bash
# Game-day experiments against the local kind cluster. Run ONE at a time while
# watching Grafana (http://localhost:3001 → "inventory-api — SLOs") and note timestamps
# for the postmortem.   usage: chaos/gameday.sh {kill-pod|db-overload|bad-deploy|restore}
set -euo pipefail
cd "$(dirname "$0")/.."
kubectl() { scripts/tb kubectl "$@"; }   # kubectl runs in the toolbox container
NS=inventory; APP=inventory-api
stamp() { echo "[$(date -u +%H:%M:%S)Z] $*"; }

case "${1:-}" in
  kill-pod)   # expect: PDB + 2 replicas keep availability; no SLO burn
    stamp "deleting one $APP pod"
    kubectl -n $NS delete pod "$(kubectl -n $NS get pod -l app.kubernetes.io/name=$APP -o name | head -1)"
    ;;
  db-overload)  # expect: latency SLO breach → InventoryLatencyP95High, then 5xx if pool/timeouts exhaust
    stamp "starting pgbench against Postgres (heavy)"
    kubectl -n $NS run pgbench --rm -i --restart=Never --image=postgres:16-alpine \
      --env PGPASSWORD=change-me -- sh -c \
      "pgbench -i -s 20 -h $APP-postgres -U inventory inventory && pgbench -c 80 -j 4 -T 180 -h $APP-postgres -U inventory inventory"
    ;;
  bad-deploy)   # expect: maxUnavailable=0 rollout stalls on the bad pods; old pods keep serving.
    # Deploy-by-commit path: commit a broken tag so ArgoCD rolls it out.
    stamp "committing nonexistent image tag via GitOps"
    sed -i.bak 's|^  tag:.*|  tag: does-not-exist|' gitops/values/inventory-api.yaml && rm gitops/values/inventory-api.yaml.bak
    git add gitops/values/inventory-api.yaml && git commit -m "chaos: bad deploy (nonexistent image tag)" && git push
    ;;
  restore)      # the fix: revert the bad commit; ArgoCD converges back
    stamp "reverting last commit"
    git revert --no-edit HEAD && git push
    ;;
  *) echo "usage: $0 {kill-pod|db-overload|bad-deploy|restore}"; exit 2 ;;
esac
stamp "done — now check: scripts/tb python3 tools/pod_doctor.py -n $NS"

#!/usr/bin/env bash
# Bring up the whole platform locally on kind: cluster → ArgoCD → app-of-apps.
# Only Docker is required on the host — kind/kubectl/helm/trivy run in the toolbox image.
# (No teardown here by design.)
set -euo pipefail
cd "$(dirname "$0")/.."
TB=scripts/tb

$TB kind get clusters | grep -qx infradian || $TB kind create cluster --config infra/terraform/local-kind/kind-config.yaml
$TB kind export kubeconfig --internal --name infradian

docker build -t inventory-api:dev services/inventory-api
$TB kind load docker-image inventory-api:dev --name infradian   # no registry needed locally

$TB kubectl create namespace argocd --dry-run=client -o yaml | $TB kubectl apply -f -
$TB kubectl apply -n argocd --server-side -f https://raw.githubusercontent.com/argoproj/argo-cd/v2.13.2/manifests/install.yaml
$TB kubectl -n argocd rollout status deploy/argocd-server --timeout=300s

# Everything else (app, Prometheus/Grafana, Loki, SLO rules) is deployed by ArgoCD from git.
$TB kubectl apply -f gitops/bootstrap/root-app.yaml

echo "ArgoCD admin password: $($TB kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d)"
echo "Grafana http://localhost:3001 (admin/admin) · Prometheus http://localhost:9090 · API http://localhost:8080/v1/resources"
echo "ArgoCD UI: scripts/tb kubectl -n argocd port-forward svc/argocd-server 8443:443 (run inside a shell with published ports) or use the NodePort mapping"

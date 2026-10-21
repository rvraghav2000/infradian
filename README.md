# Infradian

Infrastructure graph visualizer & change-impact simulator (FastAPI + Neo4j + React), now with a
full delivery platform around it: IaC, containers, CI, GitOps, observability, SLOs and chaos testing.

```mermaid
flowchart LR
  dev[Developer] -- push --> gh[GitHub]
  gh --> ci[GitHub Actions<br/>test · build · Trivy · push]
  ci -- image --> ecr[(ECR)]
  ci -- bump tag commit --> cfg[gitops/values]
  cfg -- watched by --> argo[ArgoCD]
  argo -- sync --> eks
  subgraph eks[EKS / kind cluster]
    api[inventory-api<br/>Go] --> pg[(PostgreSQL)]
    prom[Prometheus] -- scrape /metrics --> api
    prom --> am[Alertmanager]
    promtail --> loki[Loki]
    graf[Grafana] --> prom
    graf --> loki
    doc[pod_doctor.py] -. kubectl .-> api
  end
  tf[Terraform] -- VPC · EKS · ECR --> eks
  tf -- state --> s3[(S3 + lockfile)]
```

## Layout
| Path | What |
|---|---|
| `infra/terraform/bootstrap` | One-time S3 state bucket (versioned, encrypted, native locking) |
| `infra/terraform/aws` | VPC + EKS + ECR, remote state in S3 |
| `infra/terraform/local-kind` | kind cluster config (local stand-in for EKS) |
| `services/inventory-api` | Go service + PostgreSQL, `/metrics`, `/healthz`, `/readyz`, Dockerfile (distroless) |
| `deploy/helm/inventory-api` | Helm chart (app, Postgres, PDB, ServiceMonitor) |
| `.github/workflows/ci.yml` | test → build → **Trivy** → push to **ECR** → commit new tag to `gitops/` |
| `gitops/` | ArgoCD app-of-apps: app, kube-prometheus-stack, Loki, observability config |
| `observability/` | SLO recording rules + alerts, Grafana dashboard |
| `tools/pod_doctor.py` | Detects unhealthy pods; reports or restarts them |
| `chaos/` | k6 load test + game-day scripts |
| `docs/` | Runbook, postmortem template |
| `backend/`, `frontend/` | The original Infradian app |

## SLOs
| SLO | Target | Alerts |
|---|---|---|
| Availability | 99.5% non-5xx over 30d (0.5% budget) | `InventoryAvailabilityBurnFast` (14.4× · page), `…BurnSlow` (6× · ticket), `InventoryDown` |
| Latency | p95 < 300 ms | `InventoryLatencyP95High` |

## Run it locally (kind)
```bash
# Only Docker is needed on the host. kind, kubectl, helm, trivy, terraform and k6 all run
# inside the toolbox image (tools/toolbox) via the scripts/tb wrapper.
scripts/local-up.sh            # kind + ArgoCD + app-of-apps
scripts/tb python3 tools/pod_doctor.py -n inventory
scripts/tb k6 run --env BASE_URL=http://host.docker.internal:8080 chaos/loadtest.js
scripts/tb trivy image inventory-api:dev
docker compose up                      # original app: Neo4j + FastAPI + React (:3000)
docker compose --profile platform up   # + inventory-api and its Postgres (:8080)
chaos/gameday.sh kill-pod      # | db-overload | bad-deploy | restore
```
ArgoCD syncs from the repo's `main` branch, so push your commits first. For kind, the image is
side-loaded (`inventory-api:dev`); for EKS, CI pushes to ECR and rewrites `gitops/values/inventory-api.yaml`.

## Run it on AWS
```bash
# prefix with scripts/tb to run terraform in the toolbox (pass AWS creds via env)
cd infra/terraform/bootstrap && terraform init && terraform apply -var state_bucket_name=infradian-tfstate-<acct>
cd ../aws && cp backend.hcl.example backend.hcl   # edit bucket
terraform init -backend-config=backend.hcl && terraform apply
```
Set the repo secret `AWS_ROLE_ARN` (GitHub OIDC role with ECR push) for CI.

## Tearing down
Not automated here on purpose. When you're done with AWS, from `infra/terraform/aws` run
`terraform destroy` (EKS + NAT cost money). The state bucket has `prevent_destroy`; remove that
lifecycle block before destroying `bootstrap`.

## Status / still to do
- Postmortem: `docs/postmortems/TEMPLATE.md` is ready; the real one needs the game-day run on a live cluster.
- Demo GIF: record after the game day and drop it at `docs/demo.gif`.
- `kind`, `helm`, `trivy` and an AWS account are needed to exercise the cluster-side pieces; here only
  the Go tests, Docker build, `helm lint`, `terraform validate` and `pod_doctor` tests were run.

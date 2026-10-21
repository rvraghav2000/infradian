# IaC Studio

![IaC Studio](img/studio-code.png)

Design on the canvas, get Terraform/OpenTofu, and ship it — all from the Infradian UI.

| Capability | How it works |
|---|---|
| Multi-cloud canvas | Palette lists AWS, Azure, GCP and OCI resources (`backend/app/iac/catalog.py`); one workspace can mix them |
| Real-time code generation | Canvas → `POST /api/v1/iac/generate` → `versions.tf`, `providers.tf`, `main.tf`, `variables.tf`, `outputs.tf`. Terraform or OpenTofu toggle |
| Bidirectional sync | Edit the code and the canvas updates after you stop typing (`/iac/parse`, python-hcl2); nodes keep identity/position and your resource names |
| Dynamic linking | Containment (VPC ⊃ subnet) and drawn edges (instance → security group) become real references (`subnet_id = aws_subnet.app.id`); missing required values become variables automatically |
| Variables / locals / outputs | **Variables** tab, persisted with the workspace |
| Reverse engineering | Paste/edit `.tf`, **Import from Git repo** (shallow clone, reads `.tf` only), **Import live infra** |
| Plan / apply | **Deploy** tab runs `init/validate/plan/apply` in Docker (`hashicorp/terraform` or OpenTofu). Apply needs `INFRADIAN_ALLOW_APPLY=1`, an explicit confirm, a saved plan and no policy denials. **No destroy** |
| Git | Commit generated code to a per-workspace repo; optional push to any https/ssh remote (GitHub, GitLab, Bitbucket, Azure DevOps) |
| Cost | Static price table by default; real pricing via Infracost image when `INFRACOST_API_KEY` is set (untested here) |
| Security + policy | Built-in guardrails + policy-as-code (`data/policies.json`, defaults in `rules.py`), plus optional full Checkov run in Docker |
| Collaboration | WebSocket rooms per workspace: presence + live graph sync, comments, template catalog |
| RBAC | viewer < editor < deployer < admin (`data/rbac.json`; `INFRADIAN_DEFAULT_ROLE`, default `admin` for local dev) |

Caveats: RBAC trusts the `X-Infradian-User` header (no authentication — put it behind SSO/an auth proxy);
collaboration is last-writer-wins on a single API process; Azure VMs/Cloud SQL etc. need extra attributes before a real apply.
Tests: `cd backend && venv/bin/python -m pytest tests/test_iac.py`.

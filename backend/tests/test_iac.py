"""IaC studio: codegen ⇄ parse round-trip, governance, cost and RBAC."""
import pytest
from fastapi.testclient import TestClient

from app.iac.codegen import generate
from app.iac.parse import parse_files
from app.iac.rules import security_scan, evaluate_policies
from app.iac.cost import estimate

GRAPH = {
    "nodes": [
        {"id": "vpc1", "type": "aws_vpc", "label": "Main VPC"},
        {"id": "sn1", "type": "aws_subnet", "label": "Public", "parentId": "vpc1"},
        {"id": "sg1", "type": "aws_security_group", "label": "web", "parentId": "vpc1"},
        {"id": "i1", "type": "aws_instance", "label": "App", "parentId": "sn1", "attributes": {"instance_type": "t3.large"}},
        {"id": "db", "type": "aws_db_instance", "label": "DB"},
        {"id": "rg", "type": "azurerm_resource_group", "label": "rg"},
        {"id": "vn", "type": "azurerm_virtual_network", "label": "vnet", "parentId": "rg"},
        {"id": "gn", "type": "google_compute_network", "label": "net"},
        {"id": "gs", "type": "google_compute_subnetwork", "label": "sub", "parentId": "gn"},
        {"id": "gi", "type": "google_compute_instance", "label": "vm", "parentId": "gs"},
        {"id": "vcn", "type": "oci_core_vcn", "label": "vcn"},
        {"id": "x", "type": "cloud_provider", "label": "boundary"},
    ],
    "edges": [{"source": "i1", "target": "sg1"}, {"source": "db", "target": "sg1"}],
    "outputs": [{"name": "vpc_id", "value": "aws_vpc.main_vpc.id"}],
}


def test_references_and_variables():
    r = generate(GRAPH)
    main = r["files"]["main.tf"]
    assert "subnet_id = aws_subnet.public.id" in main
    assert "vpc_security_group_ids = [aws_security_group.web.id]" in main
    assert 'variable "db_password"' in r["files"]["variables.tf"] and "sensitive   = true" in r["files"]["variables.tf"]
    assert any("boundary" in w for w in r["warnings"])


def test_four_clouds_in_one_workspace():
    versions = generate(GRAPH)["files"]["versions.tf"]
    for src in ("hashicorp/aws", "hashicorp/azurerm", "hashicorp/google", "oracle/oci"):
        assert src in versions


def test_roundtrip_is_stable():
    first = generate(GRAPH)["files"]
    second = generate(parse_files(first))["files"]
    assert first == second


def test_opentofu_header():
    assert "OpenTofu" in generate(GRAPH, "opentofu")["files"]["versions.tf"]


def test_code_edit_updates_graph():
    files = generate(GRAPH)["files"]
    files["main.tf"] = files["main.tf"].replace("t3.large", "m5.xlarge")
    node = next(n for n in parse_files(files)["nodes"] if n["id"] == "aws_instance.app")
    assert node["attributes"]["instance_type"] == "m5.xlarge"


def test_bad_hcl_raises():
    with pytest.raises(ValueError):
        parse_files({"main.tf": 'resource "aws_vpc" "x" {'})


def test_security_and_policy():
    files = {"main.tf": 'resource "aws_db_instance" "d" {\n  password = "hunter2"\n  storage_encrypted = false\n  publicly_accessible = true\n}\n'}
    rules_hit = {f["rule"] for f in security_scan(files)}
    assert {"INF-SEC-001", "INF-SEC-003", "INF-SEC-004"} <= rules_hit
    assert any(v["policy"] == "POL-002" and v["enforcement"] == "deny" for v in evaluate_policies(files))


def test_cost_scales_with_size():
    small = estimate({"main.tf": 'resource "aws_instance" "a" {\n  instance_type = "t3.micro"\n}\n'})["monthly_total"]
    big = estimate({"main.tf": 'resource "aws_instance" "a" {\n  instance_type = "m5.xlarge"\n}\n'})["monthly_total"]
    assert big > small > 0


@pytest.fixture
def client(tmp_path, monkeypatch):
    from app import main
    from app.iac import rbac
    monkeypatch.setattr(rbac, "RBAC_FILE", str(tmp_path / "rbac.json"))
    rbac.save_users({"ann": {"role": "viewer"}, "bob": {"role": "deployer"}})
    return TestClient(main.app)


def test_viewer_can_generate_but_not_run(client):
    h = {"X-Infradian-User": "ann"}
    assert client.post("/api/v1/iac/generate", json={"graph": GRAPH}, headers=h).status_code == 200
    assert client.post("/api/v1/iac/run", json={"action": "plan", "files": {}}, headers=h).status_code == 403


def test_apply_and_destroy_are_gated(client, monkeypatch):
    monkeypatch.delenv("INFRADIAN_ALLOW_APPLY", raising=False)
    h = {"X-Infradian-User": "bob"}
    r = client.post("/api/v1/iac/run", json={"action": "apply", "files": {"main.tf": ""}, "confirm": True}, headers=h)
    assert r.status_code == 200 and not r.json()["ok"] and "disabled" in r.json()["output"]
    r = client.post("/api/v1/iac/run", json={"action": "destroy", "files": {}}, headers=h)
    assert not r.json()["ok"] and "not supported" in r.json()["output"]


def _until(ws, kind, limit=6):
    for _ in range(limit):
        m = ws.receive_json()
        if m["type"] == kind:
            return m
    raise AssertionError(f"never received {kind}")


def test_websocket_presence_and_viewer_readonly(client):
    with client.websocket_connect("/api/v1/collab/ws/ws1?user=bob") as a, \
         client.websocket_connect("/api/v1/collab/ws/ws1?user=ann") as v:
        assert _until(a, "hello")["you"] == "bob"
        assert len(_until(v, "hello")["presence"]) == 2
        a.send_json({"type": "graph", "graph": {"nodes": [{"id": "n1"}]}})
        assert _until(a, "ack")["version"] == 1
        assert _until(v, "graph")["by"] == "bob"
        v.send_json({"type": "graph", "graph": {"nodes": []}})
        assert _until(v, "error")["message"] == "viewers cannot edit"


def test_code_names_survive_canvas_roundtrip():
    code = {"main.tf": 'resource "aws_vpc" "core" {\n  cidr_block = "10.0.0.0/16"\n}\n'}
    again = generate(parse_files(code))["files"]["main.tf"]
    assert 'resource "aws_vpc" "core"' in again

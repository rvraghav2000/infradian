import json
import time
import urllib.request
import urllib.error

BASE_URL = "http://localhost:8000/api/v1"

def post_json(url, data):
    req = urllib.request.Request(url, data=json.dumps(data).encode('utf-8'))
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req) as response:
            return response.getcode()
    except urllib.error.HTTPError as e:
        print(f"HTTP Error {e.code}: {e.read().decode()}")
        return e.code
    except Exception as e:
        print(f"Error: {e}")
        return None

def seed():
    print("🚀 Seeding Infradian Demo Data (via urllib)...")
    
    # ── Nodes ────────────────────────────────────────────────────────
    nodes = [
        # VPC
        {
            "id": "aws_vpc.production",
            "type": "aws_vpc",
            "label": "Production VPC (10.0.0.0/16)",
            "status": "live",
            "metrics": {"current_load": 0.1},
            "attributes": {"cidr": "10.0.0.0/16", "region": "us-east-1"}
        },
        # Subnets
        {
            "id": "aws_subnet.public",
            "type": "aws_subnet",
            "label": "Public Subnet",
            "parentId": "aws_vpc.production",
            "status": "live",
            "metrics": {"current_load": 0.2},
            "attributes": {"cidr": "10.0.1.0/24"}
        },
        {
            "id": "aws_subnet.private",
            "type": "aws_subnet",
            "label": "Private Data Subnet",
            "parentId": "aws_vpc.production",
            "status": "live",
            "metrics": {"current_load": 0.05},
            "attributes": {"cidr": "10.0.2.0/24"}
        },
        # Resources
        {
            "id": "aws_instance.web",
            "type": "aws_instance",
            "label": "Web Server (NGINX)",
            "parentId": "aws_subnet.public",
            "status": "live",
            "metrics": {"current_load": 0.65},
            "attributes": {"instance_type": "t3.medium", "public_ip": "34.201.10.5"}
        },
        {
            "id": "aws_instance.api",
            "type": "aws_instance",
            "label": "API Gateway (FastAPI)",
            "parentId": "aws_subnet.public",
            "status": "live",
            "metrics": {"current_load": 0.42},
            "attributes": {"instance_type": "t3.large"}
        },
        {
            "id": "aws_db_instance.db",
            "type": "aws_db_instance",
            "label": "Primary RDS (PostgreSQL)",
            "parentId": "aws_subnet.private",
            "status": "live",
            "metrics": {"current_load": 0.88},
            "attributes": {"engine": "postgres", "version": "14.1"}
        }
    ]

    # ── Edges ────────────────────────────────────────────────────────
    edges = [
        {
            "id": "rel_web_to_api",
            "source": "aws_instance.web",
            "target": "aws_instance.api",
            "label": "HTTPS/443",
            "attributes": {"protocol": "TCP"}
        },
        {
            "id": "rel_api_to_db",
            "source": "aws_instance.api",
            "target": "aws_db_instance.db",
            "label": "SQL/5432",
            "attributes": {"protocol": "TCP"}
        }
    ]

    # ── Push Nodes ───────────────────────────────────────────────────
    for node in nodes:
        code = post_json(f"{BASE_URL}/nodes", node)
        if code in [200, 201]:
            print(f"✅ Ingested Node: {node['id']}")
        else:
            print(f"❌ Failed Node: {node['id']} (Code: {code})")

    # Small delay to ensure nodes are indexed for relationship matching
    time.sleep(1)

    # ── Push Edges ───────────────────────────────────────────────────
    for edge in edges:
        code = post_json(f"{BASE_URL}/edges", edge)
        if code in [200, 201]:
            print(f"🔗 Ingested Edge: {edge['id']}")
        else:
            print(f"❌ Failed Edge: {edge['id']} (Code: {code})")

    print("\n✨ Seeding Complete! Refresh the dashboard to see the graph.")

if __name__ == "__main__":
    seed()

import requests
import json

def test_advanced_scoring():
    url = "http://localhost:8000/api/v1/analysis/blast-radius"
    
    # Sample graph payload with cost and metrics
    payload = {
        "source_id": "web-lb",
        "max_hops": 3,
        "direction": "downstream",
        "graph": {
            "nodes": [
                {
                    "id": "web-lb",
                    "type": "aws_elb",
                    "label": "Web Load Balancer",
                    "metrics": {"current_load": 0.2},
                    "attributes": {"environment": "prod", "cost": 100}
                },
                {
                    "id": "app-srv",
                    "type": "aws_instance",
                    "label": "Application Server",
                    "metrics": {"current_load": 0.1},
                    "attributes": {"environment": "prod", "cost": 200}
                },
                {
                    "id": "db-rds",
                    "type": "aws_db_instance",
                    "label": "RDS Production DB",
                    "metrics": {"current_load": 0.05},
                    "attributes": {"environment": "prod", "cost": 500}
                }
            ],
            "edges": [
                {"id": "e1", "source": "web-lb", "target": "app-srv", "label": "FORWARD"},
                {"id": "app-srv", "source": "app-srv", "target": "db-rds", "label": "CONNECT"}
            ]
        },
        "config": {
            "risk_weight_traffic": 1.0,
            "waste_weight_usage": 2.0
        }
    }
    
    try:
        print(f"Sending request to {url}...")
        response = requests.post(url, json=payload)
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            print("Response JSON:")
            print(json.dumps(response.json(), indent=2))
        else:
            print(f"Error: {response.text}")
    except Exception as e:
        print(f"Request failed: {e}")

if __name__ == "__main__":
    test_advanced_scoring()

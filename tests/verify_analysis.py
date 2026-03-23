import requests
import json

def test_analysis():
    url = "http://localhost:8000/api/v1/analysis/blast-radius"
    
    # Sample graph payload
    payload = {
        "source_id": "web-server",
        "max_hops": 2,
        "direction": "downstream",
        "graph": {
            "nodes": [
                {
                    "id": "web-server",
                    "type": "aws_instance",
                    "label": "Web Server",
                    "metrics": {"current_load": 0.5},
                    "attributes": {"environment": "prod"}
                },
                {
                    "id": "app-server",
                    "type": "aws_instance",
                    "label": "App Server",
                    "metrics": {"current_load": 0.3},
                    "attributes": {"environment": "prod"}
                },
                {
                    "id": "database",
                    "type": "aws_db_instance",
                    "label": "RDS Database",
                    "metrics": {"current_load": 0.8},
                    "attributes": {"environment": "prod"}
                }
            ],
            "edges": [
                {"id": "e1", "source": "web-server", "target": "app-server", "label": "HTTPS"},
                {"id": "e2", "source": "app-server", "target": "database", "label": "SQL"}
            ]
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
    test_analysis()

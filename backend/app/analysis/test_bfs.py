import sys
from pathlib import Path
project_root = str(Path(__file__).resolve().parent.parent.parent)
if project_root not in sys.path:
    sys.path.append(project_root)

from app.analysis.graph_traversal import Graph, find_all_paths_bfs
from app.models import Node, Edge, NodeMetrics

def test_enhanced_bfs():
    # Setup a sample graph with a cycle
    # A -> B -> C -> A (cycle)
    # A -> D
    nodes = [
        Node(id="A", type="box", label="A", metrics=NodeMetrics(current_load=0)),
        Node(id="B", type="box", label="B", metrics=NodeMetrics(current_load=0)),
        Node(id="C", type="box", label="C", metrics=NodeMetrics(current_load=0)),
        Node(id="D", type="box", label="D", metrics=NodeMetrics(current_load=0)),
    ]
    edges = [
        Edge(id="e1", source="A", target="B"),
        Edge(id="e2", source="B", target="C"),
        Edge(id="e3", source="C", target="A"),
        Edge(id="e4", source="A", target="D"),
    ]
    
    graph = Graph(nodes, edges)
    
    print("Testing BFS from 'A' with max_depth=5...")
    nodes_list, paths = find_all_paths_bfs(graph, "A", max_depth=5)
    
    print("\nNodes found:")
    for n in nodes_list:
        print(f" - {n}")
        
    print("\nPaths found:")
    for p in paths:
        print(f" - {' -> '.join(p)}")

    # Assertions
    node_ids = {n["id"] for n in nodes_list}
    assert "A" in node_ids
    assert "B" in node_ids
    assert "C" in node_ids
    assert "D" in node_ids
    
    # Check for cycle containment in paths
    for p in paths:
        assert len(p) == len(set(p)), f"Cycle detected in path: {p}"
        
    print("\nAssertion passed: No cycles inside paths.")
    print(f"Total paths: {len(paths)}")

if __name__ == "__main__":
    test_enhanced_bfs()

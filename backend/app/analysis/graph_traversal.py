from typing import List, Dict, Set, Tuple, Optional, Any
from collections import deque
from ..models import Node, Edge

class Graph:
    """Adjacency list representation of the infrastructure graph."""
    
    def __init__(self, nodes: List[Node], edges: List[Edge]):
        self.nodes = nodes
        self.edges = edges
        self.nodes_map = {node.id: node for node in nodes}
        self.adj = {node.id: {"out": [], "in": []} for node in nodes}
        
        for edge in edges:
            if edge.source in self.adj and edge.target in self.adj:
                self.adj[edge.source]["out"].append(edge.target)
                self.adj[edge.target]["in"].append(edge.source)

    def get_node(self, node_id: str) -> Optional[Node]:
        return self.nodes_map.get(node_id)

    def get_neighbors(self, node_id: str, direction: str) -> List[str]:
        if node_id not in self.adj:
            return []
            
        neighbors = []
        if direction in ("downstream", "both"):
            neighbors.extend(self.adj[node_id]["out"])
        if direction in ("upstream", "both"):
            neighbors.extend(self.adj[node_id]["in"])
        return neighbors

def bfs_traversal(
    graph: Graph, 
    source_id: str, 
    max_hops: int = 5, 
    direction: str = "downstream"
) -> Dict[str, int]:
    """
    Performs a BFS traversal starting from source_id.
    Returns a dictionary mapping node_id to its minimum depth from the source.
    """
    if source_id not in graph.adj:
        return {}

    visited = {source_id: 0}
    queue = deque([(source_id, 0)])

    while queue:
        curr_id, depth = queue.popleft()
        
        if depth >= max_hops:
            continue
            
        for neighbor_id in graph.get_neighbors(curr_id, direction):
            if neighbor_id not in visited:
                visited[neighbor_id] = depth + 1
                queue.append((neighbor_id, depth + 1))
                
    return visited

def find_all_paths_bfs(
    graph: Graph,
    source_id: str,
    max_depth: int = 5,
    direction: str = "downstream"
) -> Tuple[List[Dict[str, Any]], List[List[str]]]:
    """
    Enhanced BFS that tracks all paths, avoids cycles, and assigns depth-based weights.
    
    Returns:
        - A list of node dictionaries with 'id', 'depth', and 'weight'.
        - A list of all unique paths found.
    """
    if source_id not in graph.adj:
        return [], []

    # Queue of (current_node, path_so_far, current_depth)
    queue = deque([(source_id, [source_id], 0)])
    
    all_paths = []
    # nodes_min_depth stores the minimum depth each node was first reached at
    nodes_min_depth = {source_id: 0}
    
    while queue:
        curr_id, path, depth = queue.popleft()
        
        # Record this path
        all_paths.append(path)
        
        if depth >= max_depth:
            continue
            
        for neighbor_id in graph.get_neighbors(curr_id, direction):
            # Avoid cycles within the current path
            if neighbor_id in path:
                continue
                
            # Update min depth for nodes (first visit is shortest)
            if neighbor_id not in nodes_min_depth:
                nodes_min_depth[neighbor_id] = depth + 1
            
            # Continue BFS with the new path
            new_path = path + [neighbor_id]
            queue.append((neighbor_id, new_path, depth + 1))

    # Format nodes with weights
    # Weight = 1.0 / (depth + 1)
    nodes_list = []
    for nid, depth in nodes_min_depth.items():
        nodes_list.append({
            "id": nid,
            "depth": depth,
            "weight": round(1.0 / (depth + 1), 3)
        })
        
    return nodes_list, all_paths

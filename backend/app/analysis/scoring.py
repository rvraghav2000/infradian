from typing import List, Dict, Any, Optional
from pydantic import BaseModel
from ..models import Node

class ScoringConfig(BaseModel):
    """Configurable weights and thresholds for the scoring system."""
    risk_weight_depth: float = 1.0
    risk_weight_traffic: float = 0.5
    risk_weight_criticality: float = 0.3
    
    waste_weight_cost: float = 1.0
    waste_weight_usage: float = 1.0
    
    conf_weight_completeness: float = 0.6
    conf_weight_agreement: float = 0.4
    
    critical_types: List[str] = ["aws_db_instance", "aws_rds_cluster", "aws_lambda_function"]
    env_weights: Dict[str, float] = {"prod": 1.0, "staging": 0.5, "dev": 0.2}

DEFAULT_CONFIG = ScoringConfig()

def calculate_node_risk(node: Node, depth: int, config: ScoringConfig = DEFAULT_CONFIG) -> float:
    """
    Computes risk for a single node.
    Formula: (Weight/Depth) * Traffic * Criticality
    """
    if depth == 0: return 0.0 # Source node has no 'radius' risk itself
    
    env = node.attributes.get("environment", "prod").lower()
    env_weight = config.env_weights.get(env, 1.0)
    
    # Depth factor (inverse)
    depth_factor = 1.0 / (depth * config.risk_weight_depth)
    
    # Traffic (0.0 to 1.0)
    traffic = node.metrics.current_load if node.metrics else 0.5
    
    # Criticality
    is_critical = node.type in config.critical_types
    criticality_factor = 1.5 if is_critical else 1.0
    
    raw_risk = (env_weight * depth_factor) * (traffic * config.risk_weight_traffic) * (criticality_factor * config.risk_weight_criticality)
    return min(raw_risk * 100, 100.0)

def calculate_node_waste(node: Node, config: ScoringConfig = DEFAULT_CONFIG) -> float:
    """
    Computes waste based on cost and usage.
    Formula: Cost * (1 - Usage)
    """
    cost = float(node.attributes.get("cost", 0.0))
    usage = node.metrics.current_load if node.metrics else 1.0 # Assume full usage if unknown (to avoid false positives)
    
    raw_waste = (cost * config.waste_weight_cost) * ((1.0 - usage) * config.waste_weight_usage)
    return round(raw_waste, 2)

def calculate_node_confidence(node: Node, config: ScoringConfig = DEFAULT_CONFIG) -> float:
    """
    Computes data confidence based on completeness and signal agreement.
    """
    # Completeness: presence of key fields
    fields = ["attributes", "metrics", "type", "label"]
    present = sum(1 for f in fields if getattr(node, f, None))
    completeness = present / len(fields)
    
    # Agreement: consistency between provider type and human label (example heuristic)
    # If type is 'aws_vpc' and label contains 'VPC', agreement is high
    type_name = node.type.split("_")[-1].lower()
    agreement = 1.0 if type_name in node.label.lower() else 0.7
    
    score = (completeness * config.conf_weight_completeness) + (agreement * config.conf_weight_agreement)
    return round(score * 100, 1)

def get_node_scores(node: Node, depth: int, config: ScoringConfig = DEFAULT_CONFIG) -> Dict[str, float]:
    """Returns all scores for a node in a structured format."""
    return {
        "risk": calculate_node_risk(node, depth, config),
        "waste": calculate_node_waste(node, config),
        "confidence": calculate_node_confidence(node, config)
    }

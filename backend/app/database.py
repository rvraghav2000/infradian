import os
from neo4j import GraphDatabase
import logging

# Configuration
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USER", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "admin123")

class Neo4jConnector:
    def __init__(self):
        self.driver = None
        try:
            self.driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
            logging.info(f"Initialized Neo4j driver at {NEO4J_URI}")
        except Exception as e:
            logging.error(f"Failed to create Neo4j driver: {e}")

    def close(self):
        if self.driver:
            self.driver.close()
            logging.info("Neo4j driver closed")

    def query(self, cypher, parameters=None):
        if not self.driver:
            logging.error("Neo4j driver not initialized")
            return None
            
        with self.driver.session() as session:
            try:
                result = session.run(cypher, parameters)
                return [record.data() for record in result]
            except Exception as e:
                logging.error(f"Cypher query failed: {e}")
                return None

    def test_connection(self):
        """Simple query to verify connectivity."""
        return self.query("RETURN 'Neo4j is online' AS status")

# Global instance for easy import
db = Neo4jConnector()

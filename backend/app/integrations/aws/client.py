import os
import boto3
from typing import Optional

class AWSClient:
    """Wrapper for boto3 to manage session and clients efficiently."""

    def __init__(
        self,
        region_name: Optional[str] = None,
        aws_access_key_id: Optional[str] = None,
        aws_secret_access_key: Optional[str] = None,
        aws_session_token: Optional[str] = None
    ):
        self.region_name = region_name or os.getenv("AWS_DEFAULT_REGION", "us-east-1")
        
        # If explicit credentials are provided, pass them to the session.
        # Otherwise, Boto3 will dynamically search the environment.
        session_kwargs = {"region_name": self.region_name}
        if aws_access_key_id and aws_secret_access_key:
            session_kwargs["aws_access_key_id"] = aws_access_key_id
            session_kwargs["aws_secret_access_key"] = aws_secret_access_key
        if aws_session_token:
            session_kwargs["aws_session_token"] = aws_session_token
            
        self.session = boto3.Session(**session_kwargs)

    def get_client(self, service_name: str):
        """Returns a boto3 client for the given service."""
        return self.session.client(service_name)

    @staticmethod
    def test_connection(
        region_name: Optional[str] = None,
        aws_access_key_id: Optional[str] = None,
        aws_secret_access_key: Optional[str] = None,
        aws_session_token: Optional[str] = None
    ) -> bool:
        """Lightweight check to ensure credentials are valid."""
        try:
            client = AWSClient(
                region_name, aws_access_key_id, aws_secret_access_key, aws_session_token
            ).get_client('sts')
            client.get_caller_identity()
            return True
        except Exception:
            return False

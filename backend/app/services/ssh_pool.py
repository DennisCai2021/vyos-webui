"""SSH Connection Pool - Reuse SSH connections for better performance"""
import time
import logging
from typing import Optional
from contextlib import contextmanager

from app.services.vyos_ssh import VyOSSSHClient, VyOSSSHConfig
from app.core.config import settings

logger = logging.getLogger(__name__)


class SSHConnectionPool:
    """Simple SSH connection pool - maintains a single persistent connection"""

    _instance: Optional['SSHConnectionPool'] = None
    _client: Optional[VyOSSSHClient] = None
    _config: Optional[VyOSSSHConfig] = None
    _last_used: float = 0
    _lock = False

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def __init__(self):
        if self._config is None:
            self._config = VyOSSSHConfig(
                host=settings.vyos_host,
                port=settings.vyos_port,
                username=settings.vyos_username,
                password=settings.vyos_password,
                timeout=settings.vyos_timeout,
            )

    def get_client(self) -> VyOSSSHClient:
        """Get an SSH client - creates new if not connected or expired"""
        # Simple expiration - reconnect if not used in 30s
        now = time.time()
        if self._client is None or not self._client.is_connected() or (now - self._last_used > 30):
            if self._client:
                try:
                    self._client.disconnect()
                except:
                    pass
            logger.debug("Creating new SSH connection")
            self._client = VyOSSSHClient(self._config)
            self._client.connect()
        self._last_used = now
        return self._client

    @contextmanager
    def connection(self):
        """Context manager for SSH connection"""
        client = self.get_client()
        try:
            yield client
        finally:
            pass


# Singleton instance
_pool = SSHConnectionPool()


def get_ssh_client() -> VyOSSSHClient:
    """Get SSH client from pool"""
    return _pool.get_client()


@contextmanager
def get_ssh_connection():
    """Get SSH connection context manager"""
    with _pool.connection():
        yield _pool.get_client()

"""VyOS service for SSH command execution"""
import paramiko
from loguru import logger

from app.core.config import settings


class VyOSService:
    """Service for interacting with VyOS via SSH"""

    def __init__(
        self,
        host: str | None = None,
        port: int | None = None,
        username: str | None = None,
        password: str | None = None,
        timeout: int | None = None,
    ):
        """Initialize VyOS SSH connection"""
        self.host = host or settings.vyos_host
        self.port = port or settings.vyos_port
        self.username = username or settings.vyos_username
        self.password = password or settings.vyos_password
        self.timeout = timeout or settings.vyos_timeout
        self.client: paramiko.SSHClient | None = None

    def connect(self) -> None:
        """Establish SSH connection to VyOS"""
        if not all([self.host, self.username, self.password]):
            raise ValueError("VyOS connection parameters not configured")

        self.client = paramiko.SSHClient()
        self.client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        self.client.connect(
            hostname=self.host,
            port=self.port,
            username=self.username,
            password=self.password,
            timeout=self.timeout,
        )
        logger.info(f"Connected to VyOS at {self.host}")

    def disconnect(self) -> None:
        """Close SSH connection"""
        if self.client:
            self.client.close()
            self.client = None
            logger.info("Disconnected from VyOS")

    def execute_command(self, command: str) -> str:
        """Execute a command on VyOS and return output"""
        if not self.client:
            raise RuntimeError("Not connected to VyOS")

        logger.debug(f"Executing command: {command}")
        stdin, stdout, stderr = self.client.exec_command(command, timeout=self.timeout)

        output = stdout.read().decode("utf-8")
        error = stderr.read().decode("utf-8")

        if error:
            logger.warning(f"Command error: {error}")

        return output

    def __enter__(self):
        """Context manager entry"""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.disconnect()

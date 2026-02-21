"""VyOS SSH Connection and Authentication Module"""
import paramiko
from loguru import logger
from pydantic import BaseModel


class VyOSSSHConfig(BaseModel):
    """VyOS SSH connection configuration"""

    host: str
    port: int = 22
    username: str
    password: str = ""
    private_key_path: str | None = None
    private_key_password: str | None = None
    timeout: int = 30
    keepalive_interval: int = 30


class VyOSSSHClient:
    """VyOS SSH client with connection management"""

    def __init__(self, config: VyOSSSHConfig):
        """Initialize SSH client with configuration"""
        self.config = config
        self.client: paramiko.SSHClient | None = None
        self._connected = False

    def connect(self) -> None:
        """Establish SSH connection to VyOS"""
        if self._connected and self.client:
            return

        try:
            self.client = paramiko.SSHClient()
            self.client.set_missing_host_key_policy(paramiko.WarningPolicy())

            # Prepare authentication
            auth_kwargs: dict[str, int | str] = {
                "hostname": self.config.host,
                "port": self.config.port,
                "username": self.config.username,
                "timeout": self.config.timeout,
                "allow_agent": False,
                "look_for_keys": False,
            }

            # Use private key if provided
            if self.config.private_key_path:
                key = paramiko.RSAKey.from_private_key_file(
                    self.config.private_key_path,
                    password=self.config.private_key_password,
                )
                auth_kwargs["pkey"] = key
            else:
                auth_kwargs["password"] = self.config.password

            self.client.connect(**auth_kwargs)

            # Enable keepalive
            if self.client.get_transport():
                self.client.get_transport().set_keepalive(self.config.keepalive_interval)

            self._connected = True
            logger.info(f"SSH connected to {self.config.username}@{self.config.host}:{self.config.port}")

        except paramiko.AuthenticationException:
            raise ConnectionError(f"Authentication failed for {self.config.username}@{self.config.host}")
        except paramiko.SSHException as e:
            raise ConnectionError(f"SSH connection failed: {e}")
        except Exception as e:
            raise ConnectionError(f"Connection error: {e}")

    def disconnect(self) -> None:
        """Close SSH connection"""
        if self.client:
            try:
                self.client.close()
            except Exception as e:
                logger.warning(f"Error closing SSH connection: {e}")
            finally:
                self.client = None
                self._connected = False
                logger.info("SSH disconnected")

    def is_connected(self) -> bool:
        """Check if client is connected"""
        return self._connected and self.client is not None

    def __enter__(self):
        """Context manager entry"""
        self.connect()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        """Context manager exit"""
        self.disconnect()

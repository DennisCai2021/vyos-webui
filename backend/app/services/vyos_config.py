"""VyOS Configuration Service using interactive shell - Simple, Fast & Reliable"""
import time
import logging
from typing import Optional

logger = logging.getLogger(__name__)


class VyOSConfigSession:
    """VyOS configuration session using interactive shell"""

    def __init__(self, ssh_client):
        """Initialize with SSH client

        Args:
            ssh_client: VyOSSSHClient instance with active connection
        """
        self.ssh_client = ssh_client
        self.shell = None
        self.in_config_mode = False

    def open(self) -> bool:
        """Open interactive shell

        Returns:
            True if shell opened successfully
        """
        try:
            self.shell = self.ssh_client.client.invoke_shell()
            time.sleep(0.3)
            self._drain_output()
            return True
        except Exception as e:
            logger.error(f"Failed to open shell: {e}")
            return False

    def _drain_output(self) -> None:
        """Quickly drain any pending output"""
        if not self.shell:
            return
        start = time.time()
        while time.time() - start < 0.2:
            if self.shell.recv_ready():
                self.shell.recv(32768)
                time.sleep(0.01)
            else:
                break

    def _send_and_sleep(self, command: str, sleep_time: float) -> str:
        """Send command and sleep for specified time

        Args:
            command: Command to send
            sleep_time: Time to sleep after sending

        Returns:
            Command output
        """
        if not self.shell:
            return ""

        try:
            self._drain_output()
            self.shell.send(command + "\n")
            time.sleep(sleep_time)

            # Read whatever output is available
            output = ""
            start = time.time()
            while time.time() - start < 0.1:
                if self.shell.recv_ready():
                    output += self.shell.recv(32768).decode('utf-8', errors='replace')
                else:
                    break
            return output
        except Exception as e:
            logger.error(f"Failed to send command: {e}")
            return ""

    def enter_config_mode(self) -> bool:
        """Enter configuration mode"""
        if self.in_config_mode:
            return True
        output = self._send_and_sleep("configure", 0.6)
        self.in_config_mode = True
        return True

    def exit_config_mode(self, save: bool = False) -> bool:
        """Exit configuration mode"""
        if not self.in_config_mode:
            return True
        if save:
            self._send_and_sleep("save", 0.4)
        self._send_and_sleep("exit", 0.3)
        self.in_config_mode = False
        return True

    def set(self, path: str) -> bool:
        """Set configuration value"""
        if not self.in_config_mode and not self.enter_config_mode():
            return False
        output = self._send_and_sleep(f"set {path}", 0.2)
        return "error" not in output.lower() and "fail" not in output.lower()

    def delete(self, path: str) -> bool:
        """Delete configuration value"""
        if not self.in_config_mode and not self.enter_config_mode():
            return False
        output = self._send_and_sleep(f"delete {path}", 0.2)
        return "error" not in output.lower() and "fail" not in output.lower()

    def commit(self, comment: Optional[str] = None) -> bool:
        """Commit configuration changes"""
        if not self.in_config_mode:
            return False
        cmd = "commit"
        if comment:
            cmd += f' comment "{comment}"'
        output = self._send_and_sleep(cmd, 0.8)
        return "error" not in output.lower() and "fail" not in output.lower() and "abort" not in output.lower()

    def save(self) -> bool:
        """Save configuration"""
        output = self._send_and_sleep("save", 0.5)
        return "error" not in output.lower() and "fail" not in output.lower()

    def close(self) -> None:
        """Close the session"""
        try:
            if self.in_config_mode and self.shell:
                try:
                    # Just exit normally - don't discard since we might have committed
                    self._send_and_sleep("exit", 0.2)
                except:
                    pass
            if self.shell:
                self.shell.close()
        except Exception as e:
            logger.warning(f"Error closing session: {e}")
        finally:
            self.shell = None
            self.in_config_mode = False

    def __enter__(self):
        self.open()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.close()

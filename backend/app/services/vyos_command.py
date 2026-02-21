"""VyOS Command Execution Module with Retry and Timeout"""
import time
import asyncio
from contextlib import contextmanager
from dataclasses import dataclass
from enum import Enum
from typing import AsyncIterator, Any

from loguru import logger

from app.services.vyos_ssh import VyOSSSHClient


class CommandStatus(Enum):
    """Command execution status"""

    SUCCESS = "success"
    FAILED = "failed"
    TIMEOUT = "timeout"
    ERROR = "error"


@dataclass
class CommandResult:
    """Command execution result"""

    status: CommandStatus
    stdout: str
    stderr: str
    exit_code: int
    command: str
    execution_time: float
    retry_count: int = 0


class CommandTimeoutError(Exception):
    """Command execution timeout"""

    pass


class VyOSCommandExecutor:
    """VyOS command executor with retry mechanism and timeout control"""

    def __init__(self, ssh_client: VyOSSSHClient, default_timeout: int = 30, max_retries: int = 3):
        """Initialize command executor"""
        self.ssh_client = ssh_client
        self.default_timeout = default_timeout
        self.max_retries = max_retries

    @contextmanager
    def _with_timeout(self, timeout: int):
        """Context manager for command timeout"""
        import signal

        def timeout_handler(signum, frame):
            raise CommandTimeoutError(f"Command timed out after {timeout} seconds")

        # Set signal handler
        old_handler = signal.signal(signal.SIGALRM, timeout_handler)
        signal.alarm(timeout)

        try:
            yield
        finally:
            signal.alarm(0)  # Cancel alarm
            signal.signal(signal.SIGALRM, old_handler)

    def execute(
        self,
        command: str,
        timeout: int | None = None,
        retries: int | None = None,
        raise_on_error: bool = False,
    ) -> CommandResult:
        """Execute command with retry mechanism

        Args:
            command: Command to execute
            timeout: Command timeout in seconds (uses default if None)
            retries: Number of retries (uses max_retries if None)
            raise_on_error: Raise exception on command failure

        Returns:
            CommandResult with execution details
        """
        timeout = timeout or self.default_timeout
        retries = retries if retries is not None else self.max_retries
        retry_count = 0
        last_error: Exception | None = None

        while retry_count <= retries:
            start_time = time.time()

            try:
                if not self.ssh_client.is_connected():
                    self.ssh_client.connect()

                logger.debug(f"Executing command: {command}")

                # Execute command with timeout
                stdin, stdout, stderr = self.ssh_client.client.exec_command(command, timeout=timeout)

                # Wait for command to complete
                exit_code = stdout.channel.recv_exit_status()

                # Read output
                stdout_text = stdout.read().decode("utf-8", errors="replace").strip()
                stderr_text = stderr.read().decode("utf-8", errors="replace").strip()

                execution_time = time.time() - start_time

                # Determine status
                if exit_code == 0:
                    status = CommandStatus.SUCCESS
                else:
                    status = CommandStatus.FAILED

                result = CommandResult(
                    status=status,
                    stdout=stdout_text,
                    stderr=stderr_text,
                    exit_code=exit_code,
                    command=command,
                    execution_time=execution_time,
                    retry_count=retry_count,
                )

                if status == CommandStatus.FAILED and raise_on_error:
                    raise RuntimeError(f"Command failed: {command}\nStderr: {stderr_text}")

                logger.debug(
                    f"Command completed: {command} - Status: {status.value}, "
                    f"Exit code: {exit_code}, Time: {execution_time:.2f}s"
                )

                return result

            except CommandTimeoutError as e:
                last_error = e
                logger.warning(f"Command timeout (attempt {retry_count + 1}/{retries + 1}): {command}")
                retry_count += 1

            except Exception as e:
                last_error = e
                logger.warning(f"Command error (attempt {retry_count + 1}/{retries + 1}): {e}")
                retry_count += 1

            # Retry delay with exponential backoff
            if retry_count <= retries:
                delay = min(2 ** retry_count, 10)  # Max 10 seconds
                logger.debug(f"Retrying in {delay}s...")
                time.sleep(delay)

        # All retries exhausted
        execution_time = time.time() - start_time
        return CommandResult(
            status=CommandStatus.ERROR,
            stdout="",
            stderr=str(last_error) if last_error else "Unknown error",
            exit_code=-1,
            command=command,
            execution_time=execution_time,
            retry_count=retry_count,
        )

    def execute_config_mode(self, command: str, **kwargs) -> CommandResult:
        """Execute command in configuration mode (configure/set)

        Args:
            command: Configuration command (without 'configure' prefix)
            **kwargs: Additional arguments for execute()

        Returns:
            CommandResult
        """
        return self.execute(f"/opt/vyatta/sbin/vyatta-cfg-cmd-wrapper set {command}", **kwargs)

    def configure(self, commands: list[str] | str) -> CommandResult:
        """Configure VyOS with multiple commands

        Args:
            commands: Single command string or list of configuration commands

        Returns:
            CommandResult
        """
        # Convert single command to list
        if isinstance(commands, str):
            commands = [commands]

        # For VyOS configuration, we need to use the cfg wrapper
        # We'll execute each command individually
        last_result: CommandResult | None = None
        for cmd in commands:
            if cmd.startswith("set ") or cmd.startswith("delete "):
                last_result = self.execute(f"/opt/vyatta/sbin/vyatta-cfg-cmd-wrapper {cmd}")
            else:
                last_result = self.execute(f"/opt/vyatta/sbin/vyatta-cfg-cmd-wrapper set {cmd}")

        # Commit the changes
        if last_result and last_result.status == CommandStatus.SUCCESS:
            self.execute("/opt/vyatta/sbin/vyatta-cfg-cmd-wrapper commit")

        return last_result or CommandResult(
            status=CommandStatus.ERROR,
            stdout="",
            stderr="No commands executed",
            exit_code=-1,
            command="",
            execution_time=0,
        )

    def execute_show(self, command: str, **kwargs) -> CommandResult:
        """Execute show command

        Args:
            command: Show command (without 'show' prefix)
            **kwargs: Additional arguments for execute()

        Returns:
            CommandResult
        """
        return self.execute(f"/opt/vyatta/bin/vyatta-op-cmd-wrapper {command}", **kwargs)

    async def execute_command_streaming(
        self, command: str, timeout: int | None = None
    ) -> AsyncIterator[str]:
        """Execute command and stream output line by line

        Args:
            command: Command to execute
            timeout: Command timeout in seconds

        Yields:
            Output lines as they arrive
        """
        timeout = timeout or self.default_timeout

        try:
            if not self.ssh_client.is_connected():
                self.ssh_client.connect()

            logger.debug(f"Executing streaming command: {command}")

            # Execute command
            stdin, stdout, stderr = self.ssh_client.client.exec_command(command, timeout=timeout)

            # Stream output line by line
            while True:
                line = stdout.readline()
                if not line:
                    break
                yield line.decode("utf-8", errors="replace")

            # Check exit code
            exit_code = stdout.channel.recv_exit_status()

            if exit_code != 0:
                stderr_text = stderr.read().decode("utf-8", errors="replace")
                logger.warning(f"Streaming command exited with code {exit_code}: {stderr_text}")

        except Exception as e:
            logger.error(f"Error in streaming command: {e}")
            yield f"Error: {str(e)}\n"

    @staticmethod
    def create_from_config(config: dict[str, Any], **kwargs: Any) -> "VyOSCommandExecutor":
        """Create executor from configuration dictionary

        Args:
            config: Configuration dictionary with SSH parameters
            **kwargs: Additional arguments for executor

        Returns:
            VyOSCommandExecutor instance
        """
        from app.services.vyos_ssh import VyOSSSHClient, VyOSSSHConfig

        ssh_config = VyOSSSHConfig(**config)
        ssh_client = VyOSSSHClient(ssh_config)
        return VyOSCommandExecutor(ssh_client, **kwargs)

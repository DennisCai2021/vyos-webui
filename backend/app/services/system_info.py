"""VyOS System Information Collection Service"""
import re
from dataclasses import dataclass
from typing import Any

from app.services.vyos_command import VyOSCommandExecutor


@dataclass
class SystemVersion:
    """VyOS system version information"""

    version: str | None = None
    build_date: str | None = None
    description: str | None = None
    kernel: str | None = None
    architecture: str | None = None
    serial_number: str | None = None


@dataclass
class SystemHardware:
    """System hardware information"""

    cpu_model: str | None = None
    cpu_cores: int | None = None
    cpu_speed: str | None = None
    memory_total: int | None = None  # in MB
    memory_free: int | None = None  # in MB
    memory_used: int | None = None  # in MB
    disk_total: int | None = None  # in GB
    disk_free: int | None = None  # in GB
    disk_used: int | None = None  # in GB


@dataclass
class SystemUptime:
    """System uptime information"""

    uptime_seconds: int = 0
    uptime_string: str = ""
    load_average_1m: float = 0.0
    load_average_5m: float = 0.0
    load_average_15m: float = 0.0


@dataclass
class ServiceStatus:
    """Service status information"""

    name: str
    status: str  # 'running', 'stopped', 'enabled', 'disabled'
    pid: int | None = None
    cpu_percent: float | None = None
    memory_percent: float | None = None


class SystemInfoCollector:
    """Collector for VyOS system information"""

    def __init__(self, executor: VyOSCommandExecutor):
        """Initialize collector

        Args:
            executor: VyOS command executor
        """
        self.executor = executor

    def get_version(self) -> SystemVersion:
        """Get VyOS version information

        Returns:
            SystemVersion object
        """
        result = self.executor.execute("/opt/vyatta/bin/vyatta-op-cmd-wrapper show version")
        info = self._parse_version_output(result.stdout)

        return SystemVersion(
            version=info.get("version"),
            build_date=info.get("build_date"),
            description=info.get("description"),
            kernel=info.get("kernel"),
            architecture=info.get("architecture"),
            serial_number=info.get("serial_number"),
        )

    def get_hardware_info(self) -> SystemHardware:
        """Get system hardware information

        Returns:
            SystemHardware object
        """
        # Get CPU info from /proc/cpuinfo
        cpu_result = self.executor.execute("cat /proc/cpuinfo | grep 'model name' | head -1")
        cpu_model = cpu_result.stdout.strip()
        if "model name" in cpu_model:
            cpu_model = cpu_model.split(":", 1)[1].strip()

        # Get core count
        core_result = self.executor.execute("nproc")
        cpu_cores = None
        try:
            cpu_cores = int(core_result.stdout.strip())
        except (ValueError, IndexError):
            pass

        # Get memory info from /proc/meminfo
        mem_total = None
        mem_free = None
        mem_used = None
        try:
            mem_result = self.executor.execute("cat /proc/meminfo")
            for line in mem_result.stdout.split("\n"):
                line = line.strip()
                if line.startswith("MemTotal:"):
                    mem_total = int(line.split()[1]) // 1024  # Convert to MB
                elif line.startswith("MemFree:"):
                    mem_free = int(line.split()[1]) // 1024
                elif line.startswith("MemAvailable:"):
                    mem_available = int(line.split()[1]) // 1024
                    if mem_total:
                        mem_used = mem_total - mem_available
        except Exception:
            pass

        # Get disk info
        disk_total = None
        disk_used = None
        disk_free = None
        try:
            disk_result = self.executor.execute("df -k / | tail -1")
            parts = disk_result.stdout.strip().split()
            if len(parts) >= 5:
                disk_total = int(parts[1]) // 1024  # KB to MB
                disk_used = int(parts[2]) // 1024
                disk_free = int(parts[3]) // 1024
        except Exception:
            pass

        return SystemHardware(
            cpu_model=cpu_model or "Unknown",
            cpu_cores=cpu_cores,
            cpu_speed=None,
            memory_total=mem_total,
            memory_used=mem_used,
            memory_free=mem_free,
            disk_total=disk_total,
            disk_used=disk_used,
            disk_free=disk_free,
        )

    def get_uptime(self) -> SystemUptime:
        """Get system uptime and load

        Returns:
            SystemUptime object
        """
        # Get uptime
        uptime_result = self.executor.execute("cat /proc/uptime")
        uptime_str = uptime_result.stdout.split()[0]
        uptime_seconds = int(float(uptime_str))

        # Get load average
        load_result = self.executor.execute("cat /proc/loadavg")
        load_parts = load_result.stdout.split()

        return SystemUptime(
            uptime_seconds=uptime_seconds,
            uptime_string=self._format_uptime(uptime_seconds),
            load_average_1m=float(load_parts[0]),
            load_average_5m=float(load_parts[1]),
            load_average_15m=float(load_parts[2]),
        )

    def get_service_status(self, service_name: str | None = None) -> list[ServiceStatus]:
        """Get system service status

        Args:
            service_name: Specific service name or None for all

        Returns:
            List of ServiceStatus objects
        """
        if service_name:
            result = self.executor.execute(f"systemctl status {service_name}")
            return [self._parse_single_service(result.stdout, service_name)]
        else:
            result = self.executor.execute("systemctl list-units --type=service --all --no-legend")
            return self._parse_service_list(result.stdout)

    def get_all_info(self) -> dict[str, Any]:
        """Get all system information in one call

        Returns:
            Dictionary with all system information
        """
        return {
            "version": self.get_version(),
            "hardware": self.get_hardware_info(),
            "uptime": self.get_uptime(),
        }

    def _parse_version_output(self, output: str) -> dict[str, str]:
        """Parse version command output"""
        info: dict[str, str] = {}

        for line in output.split("\n"):
            line = line.strip()

            if line.startswith("Version:"):
                info["version"] = line.split("Version:", 1)[1].strip()
            elif line.startswith("Release train:"):
                info["release_train"] = line.split("Release train:", 1)[1].strip()
                info["description"] = f"VyOS {info.get('version', '')} ({info.get('release_train', '')})"
            elif line.startswith("Built on:"):
                info["build_date"] = line.split("Built on:", 1)[1].strip()
            elif line.startswith("Architecture:"):
                info["architecture"] = line.split("Architecture:", 1)[1].strip()
            elif line.startswith("Hardware S/N:"):
                info["serial_number"] = line.split("Hardware S/N:", 1)[1].strip()
            elif line.startswith("Boot via:"):
                info["boot_via"] = line.split("Boot via:", 1)[1].strip()
            elif line.startswith("System type:"):
                info["system_type"] = line.split("System type:", 1)[1].strip()

        return info


    def _format_uptime(self, seconds: int) -> str:
        """Format uptime seconds to human-readable string

        Args:
            seconds: Uptime in seconds

        Returns:
            Formatted uptime string
        """
        days = seconds // 86400
        hours = (seconds % 86400) // 3600
        minutes = (seconds % 3600) // 60

        parts = []

        if days > 0:
            parts.append(f"{days}d")
        if hours > 0:
            parts.append(f"{hours}h")
        if minutes > 0:
            parts.append(f"{minutes}m")

        return " ".join(parts) or "0m"

    def _parse_service_list(self, output: str) -> list[ServiceStatus]:
        """Parse systemctl list-units output"""
        services: list[ServiceStatus] = []

        for line in output.split("\n"):
            line = line.strip()

            if not line:
                continue

            parts = line.split(None, 4)

            if len(parts) >= 4:
                name = parts[0].split(".")[0]  # Remove .service suffix
                status = self._parse_service_status(parts[3])
                services.append(ServiceStatus(name=name, status=status))

        return services

    def _parse_single_service(self, output: str, service_name: str) -> ServiceStatus:
        """Parse systemctl status output for single service"""
        status = "unknown"
        pid: int | None = None

        for line in output.split("\n"):
            if "Active: active (running)" in line:
                status = "running"
                # Try to extract PID
                pid_match = re.search(r"(\d+)", line)
                if pid_match:
                    pid = int(pid_match.group(1))
            elif "Active: inactive" in line:
                status = "stopped"
            elif "Loaded: loaded" in line and "enabled" in line:
                status = "enabled"

        return ServiceStatus(name=service_name, status=status, pid=pid)

    def _parse_service_status(self, status_str: str) -> str:
        """Parse service status string"""
        if "running" in status_str:
            return "running"
        elif "inactive" in status_str:
            return "stopped"
        elif "enabled" in status_str:
            return "enabled"
        elif "disabled" in status_str:
            return "disabled"
        return "unknown"

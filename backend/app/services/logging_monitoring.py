"""Logging and monitoring service for VyOS"""
import asyncio
import re
from datetime import datetime, timedelta
from enum import Enum
from typing import Any, AsyncGenerator
from dataclasses import dataclass, field

from loguru import logger

from app.services.vyos_command import VyOSCommandExecutor


class LogLevel(str, Enum):
    """Log level enumeration"""

    DEBUG = "debug"
    INFO = "info"
    NOTICE = "notice"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"
    ALERT = "alert"
    EMERGENCY = "emergency"


class LogSourceType(str, Enum):
    """Log source type enumeration"""

    SYSTEM = "system"  # /var/log/messages, /var/log/syslog
    KERNEL = "kernel"  # /var/log/kern.log
    AUTH = "auth"  # /var/log/auth.log
    FIREWALL = "firewall"  # firewall logs
    VPN = "vpn"  # VPN logs
    NGINX = "nginx"  # Nginx logs
    CUSTOM = "custom"  # custom logs


@dataclass
class LogEntry:
    """Log entry data model"""

    timestamp: datetime
    level: LogLevel
    source: str
    message: str
    source_type: LogSourceType = LogSourceType.SYSTEM
    process: str | None = None
    pid: int | None = None
    hostname: str | None = None
    raw: str = ""

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary"""
        return {
            "timestamp": self.timestamp.isoformat(),
            "level": self.level.value,
            "source": self.source,
            "message": self.message,
            "source_type": self.source_type.value,
            "process": self.process,
            "pid": self.pid,
            "hostname": self.hostname,
            "raw": self.raw,
        }


@dataclass
class LogFilter:
    """Log filter criteria"""

    level: LogLevel | None = None
    source_type: LogSourceType | None = None
    source: str | None = None
    process: str | None = None
    message_contains: str | None = None
    start_time: datetime | None = None
    end_time: datetime | None = None
    hostname: str | None = None
    limit: int = 1000
    offset: int = 0
    reverse: bool = True  # Newest first


@dataclass
class MetricValue:
    """Metric value data model"""

    name: str
    value: float
    unit: str
    timestamp: datetime
    labels: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary"""
        return {
            "name": self.name,
            "value": self.value,
            "unit": self.unit,
            "timestamp": self.timestamp.isoformat(),
            "labels": self.labels,
        }


@dataclass
class AlertRule:
    """Alert rule data model"""

    id: str
    name: str
    metric_name: str
    condition: str  # e.g., ">", "<", ">=", "<=", "==", "!="
    threshold: float
    duration: int  # seconds
    severity: str  # info, warning, critical
    enabled: bool = True
    description: str = ""
    actions: list[str] = field(default_factory=list)  # email, webhook, etc.
    created_at: datetime = field(default_factory=datetime.now)
    updated_at: datetime = field(default_factory=datetime.now)
    last_triggered: datetime | None = None

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary"""
        return {
            "id": self.id,
            "name": self.name,
            "metric_name": self.metric_name,
            "condition": self.condition,
            "threshold": self.threshold,
            "duration": self.duration,
            "severity": self.severity,
            "enabled": self.enabled,
            "description": self.description,
            "actions": self.actions,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
            "last_triggered": self.last_triggered.isoformat() if self.last_triggered else None,
        }


@dataclass
class Alert:
    """Alert instance data model"""

    id: str
    rule_id: str
    rule_name: str
    severity: str
    message: str
    triggered_at: datetime = field(default_factory=datetime.now)
    resolved_at: datetime | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary"""
        return {
            "id": self.id,
            "rule_id": self.rule_id,
            "rule_name": self.rule_name,
            "severity": self.severity,
            "message": self.message,
            "triggered_at": self.triggered_at.isoformat(),
            "resolved_at": self.resolved_at.isoformat() if self.resolved_at else None,
            "metadata": self.metadata,
        }


class LogParser:
    """Parser for various log formats"""

    # Syslog format regex (RFC 3164)
    SYSLOG_PATTERN = re.compile(
        r"^(?P<timestamp>\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+"
        r"(?P<hostname>\S+)\s+"
        r"(?P<process>\w+)(?:\[(?P<pid>\d+)\])?:\s+"
        r"(?P<message>.*)$"
    )

    # VyOS/systemd journal format
    JOURNAL_PATTERN = re.compile(
        r"^(?P<timestamp>\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[+-]\d{2}:\d{2})?)\s+"
        r"(?P<hostname>\S+)\s+"
        r"(?P<process>\S+)(?:\[(?P<pid>\d+)\])?:\s+"
        r"(?P<message>.*)$"
    )

    # Level mapping
    LEVEL_MAP = {
        "debug": LogLevel.DEBUG,
        "info": LogLevel.INFO,
        "notice": LogLevel.NOTICE,
        "warning": LogLevel.WARNING,
        "warn": LogLevel.WARNING,
        "error": LogLevel.ERROR,
        "err": LogLevel.ERROR,
        "critical": LogLevel.CRITICAL,
        "crit": LogLevel.CRITICAL,
        "alert": LogLevel.ALERT,
        "emergency": LogLevel.EMERGENCY,
        "emerg": LogLevel.EMERGENCY,
    }

    @classmethod
    def parse_syslog_line(cls, line: str, source_type: LogSourceType = LogSourceType.SYSTEM) -> LogEntry | None:
        """Parse a standard syslog line"""
        if not line.strip():
            return None

        match = cls.SYSLOG_PATTERN.match(line)
        if not match:
            return None

        groups = match.groupdict()

        try:
            # Parse timestamp (add current year)
            current_year = datetime.now().year
            timestamp_str = f"{current_year} {groups['timestamp']}"
            timestamp = datetime.strptime(timestamp_str, "%Y %b %d %H:%M:%S")

            # Detect log level from message
            level = cls._detect_level(groups["message"])

            return LogEntry(
                timestamp=timestamp,
                level=level,
                source=groups.get("process", "unknown"),
                message=groups.get("message", ""),
                source_type=source_type,
                process=groups.get("process"),
                pid=int(groups.get("pid")) if groups.get("pid") else None,
                hostname=groups.get("hostname"),
                raw=line,
            )
        except Exception:
            logger.debug(f"Failed to parse syslog line: {line[:100]}")
            return None

    @classmethod
    def parse_journal_line(cls, line: str, source_type: LogSourceType = LogSourceType.SYSTEM) -> LogEntry | None:
        """Parse a systemd journal format line"""
        if not line.strip():
            return None

        match = cls.JOURNAL_PATTERN.match(line)
        if not match:
            return None

        groups = match.groupdict()

        try:
            # Parse timestamp (ISO format)
            timestamp = datetime.fromisoformat(groups["timestamp"].replace("+00:00", ""))

            # Detect log level from message
            level = cls._detect_level(groups["message"])

            return LogEntry(
                timestamp=timestamp,
                level=level,
                source=groups.get("process", "unknown"),
                message=groups.get("message", ""),
                source_type=source_type,
                process=groups.get("process"),
                pid=int(groups.get("pid")) if groups.get("pid") else None,
                hostname=groups.get("hostname"),
                raw=line,
            )
        except Exception:
            logger.debug(f"Failed to parse journal line: {line[:100]}")
            return None

    @classmethod
    def _detect_level(cls, message: str) -> LogLevel:
        """Detect log level from message content"""
        message_lower = message.lower()

        for level_name, level in cls.LEVEL_MAP.items():
            if level_name in message_lower:
                return level

        return LogLevel.INFO  # Default to info


class LogCollector:
    """Collector for system and application logs"""

    # Log file paths
    LOG_PATHS = {
        LogSourceType.SYSTEM: ["/var/log/messages", "/var/log/syslog", "/var/log/system.log"],
        LogSourceType.KERNEL: ["/var/log/kern.log", "/var/log/dmesg"],
        LogSourceType.AUTH: ["/var/log/auth.log", "/var/log/secure"],
        LogSourceType.FIREWALL: ["/var/log/firewall.log", "/var/log/iptables.log", "/var/log/nftables.log"],
        LogSourceType.VPN: ["/var/log/openvpn.log", "/var/log/ipsec.log", "/var/log/wireguard.log"],
        LogSourceType.NGINX: ["/var/log/nginx/access.log", "/var/log/nginx/error.log"],
    }

    def __init__(self, executor: VyOSCommandExecutor):
        self.executor = executor
        self.parser = LogParser()

    def query_logs(self, source_type: LogSourceType, filter: LogFilter) -> list[LogEntry]:
        """Query logs from a specific source

        Args:
            source_type: Type of log source
            filter: Filter criteria

        Returns:
            List of log entries matching the filter
        """
        entries: list[LogEntry] = []

        # Get log files for this source type
        log_paths = self.LOG_PATHS.get(source_type, [])

        for log_path in log_paths:
            try:
                # Read log file via SSH
                result = self.executor.execute(
                    f"if [ -f '{log_path}' ]; then tail -n {filter.limit + filter.offset} '{log_path}'; else echo ''; fi"
                )

                if result.stdout:
                    lines = result.stdout.strip().split("\n")

                    for line in lines:
                        entry = self.parser.parse_syslog_line(line, source_type) or self.parser.parse_journal_line(
                            line, source_type
                        )
                        if entry and self._matches_filter(entry, filter):
                            entries.append(entry)

            except Exception as e:
                logger.warning(f"Failed to read log file {log_path}: {e}")

        # Apply offset and limit
        if filter.offset > 0:
            entries = entries[filter.offset:]

        if filter.limit and len(entries) > filter.limit:
            entries = entries[: filter.limit]

        # Sort by timestamp
        if filter.reverse:
            entries.sort(key=lambda x: x.timestamp, reverse=True)
        else:
            entries.sort(key=lambda x: x.timestamp)

        return entries

    def _matches_filter(self, entry: LogEntry, filter: LogFilter) -> bool:
        """Check if log entry matches filter criteria"""
        if filter.level and entry.level != filter.level:
            return False

        if filter.source and entry.source != filter.source:
            return False

        if filter.process and entry.process != filter.process:
            return False

        if filter.message_contains and filter.message_contains.lower() not in entry.message.lower():
            return False

        if filter.hostname and entry.hostname != filter.hostname:
            return False

        if filter.start_time and entry.timestamp < filter.start_time:
            return False

        if filter.end_time and entry.timestamp > filter.end_time:
            return False

        return True

    def get_firewall_logs(
        self, filter: LogFilter = LogFilter()
    ) -> list[LogEntry]:
        """Get firewall-specific logs

        Args:
            filter: Filter criteria

        Returns:
            List of firewall log entries
        """
        entries: list[LogEntry] = []

        try:
            # Use journalctl to query firewall logs
            cmd = "journalctl -u iptables -u nftables --no-pager -n 1000 --output=short"

            result = self.executor.execute(cmd)

            if result.stdout:
                lines = result.stdout.strip().split("\n")

                for line in lines:
                    entry = self.parser.parse_journal_line(line, LogSourceType.FIREWALL)
                    if entry and self._matches_filter(entry, filter):
                        entries.append(entry)

        except Exception as e:
            logger.warning(f"Failed to get firewall logs: {e}")

        return entries

    def get_vpn_logs(
        self, vpn_type: str = "all", filter: LogFilter = LogFilter()
    ) -> list[LogEntry]:
        """Get VPN-specific logs

        Args:
            vpn_type: Type of VPN (openvpn, ipsec, wireguard, all)
            filter: Filter criteria

        Returns:
            List of VPN log entries
        """
        entries: list[LogEntry] = []

        try:
            services = []

            if vpn_type in ("all", "openvpn"):
                services.extend(["openvpn", "openvpn@*"])

            if vpn_type in ("all", "ipsec"):
                services.extend(["strongswan", "ipsec", "charon"])

            if vpn_type in ("all", "wireguard"):
                services.extend(["wg-quick", "wireguard"])

            for service in services:
                cmd = f"journalctl -u '{service}' --no-pager -n 500 --output=short"

                result = self.executor.execute(cmd)

                if result.stdout:
                    lines = result.stdout.strip().split("\n")

                    for line in lines:
                        entry = self.parser.parse_journal_line(line, LogSourceType.VPN)
                        if entry and self._matches_filter(entry, filter):
                            entries.append(entry)

        except Exception as e:
            logger.warning(f"Failed to get VPN logs: {e}")

        return entries


class RealTimeLogStreamer:
    """Real-time log streaming using tail -f"""

    def __init__(self, executor: VyOSCommandExecutor):
        self.executor = executor
        self._active_streams: dict[str, asyncio.Task] = {}

    async def stream_logs(
        self, source_type: LogSourceType, source: str | None = None
    ) -> AsyncGenerator[LogEntry, None]:
        """Stream logs in real-time

        Args:
            source_type: Type of log source
            source: Specific source (e.g., journal unit)

        Yields:
            Log entries as they are generated
        """
        # Determine log source
        if source_type == LogSourceType.FIREWALL:
            cmd = "journalctl -u iptables -u nftables --no-pager -f --output=short"
        elif source_type == LogSourceType.VPN:
            cmd = "journalctl -u openvpn -u strongswan -u wireguard --no-pager -f --output=short"
        elif source_type == LogSourceType.SYSTEM:
            cmd = "journalctl --no-pager -f --output=short"
        else:
            # Default to system logs
            cmd = "journalctl --no-pager -f --output=short"

        # Execute with streaming
        process = self.executor.execute_command_streaming(cmd)

        try:
            async for line in process:
                entry = LogParser.parse_journal_line(line.strip(), source_type) or LogParser.parse_syslog_line(
                    line.strip(), source_type
                )

                if entry:
                    yield entry

        finally:
            await process.close()


class PerformanceMonitor:
    """Performance metrics collector for VyOS"""

    def __init__(self, executor: VyOSCommandExecutor):
        self.executor = executor

    def get_cpu_metrics(self) -> list[MetricValue]:
        """Get CPU performance metrics

        Returns:
            List of CPU metric values
        """
        metrics: list[MetricValue] = []
        timestamp = datetime.now()

        try:
            # Get CPU usage
            result = self.executor.execute("top -bn1 | grep 'Cpu(s)'")

            if result.stdout:
                # Parse CPU usage
                match = re.search(r"(\d+\.?\d*)%us", result.stdout)
                if match:
                    metrics.append(
                        MetricValue(
                            name="cpu.user_percent",
                            value=float(match.group(1)),
                            unit="percent",
                            timestamp=timestamp,
                        )
                    )

                match = re.search(r"(\d+\.?\d*)%sy", result.stdout)
                if match:
                    metrics.append(
                        MetricValue(
                            name="cpu.system_percent",
                            value=float(match.group(1)),
                            unit="percent",
                            timestamp=timestamp,
                        )
                    )

                match = re.search(r"(\d+\.?\d*)%id", result.stdout)
                if match:
                    metrics.append(
                        MetricValue(
                            name="cpu.idle_percent",
                            value=float(match.group(1)),
                            unit="percent",
                            timestamp=timestamp,
                        )
                    )

            # Get load average
            result = self.executor.execute("uptime | awk -F'load average:' '{print $2}'")

            if result.stdout:
                loads = result.stdout.strip().split(",")
                if len(loads) >= 3:
                    metrics.extend(
                        [
                            MetricValue(
                                name="cpu.load_1m",
                                value=float(loads[0].strip()),
                                unit="",
                                timestamp=timestamp,
                            ),
                            MetricValue(
                                name="cpu.load_5m",
                                value=float(loads[1].strip()),
                                unit="",
                                timestamp=timestamp,
                            ),
                            MetricValue(
                                name="cpu.load_15m",
                                value=float(loads[2].strip()),
                                unit="",
                                timestamp=timestamp,
                            ),
                        ]
                    )

        except Exception as e:
            logger.warning(f"Failed to get CPU metrics: {e}")

        return metrics

    def get_memory_metrics(self) -> list[MetricValue]:
        """Get memory performance metrics

        Returns:
            List of memory metric values
        """
        metrics: list[MetricValue] = []
        timestamp = datetime.now()

        try:
            result = self.executor.execute("free -m")

            if result.stdout:
                lines = result.stdout.strip().split("\n")
                if len(lines) >= 2:
                    # Parse memory line
                    mem_parts = lines[1].split()
                    if len(mem_parts) >= 4:
                        total = float(mem_parts[1])
                        used = float(mem_parts[2])
                        free = float(mem_parts[3])

                        metrics.extend(
                            [
                                MetricValue(
                                    name="memory.total_mb",
                                    value=total,
                                    unit="megabytes",
                                    timestamp=timestamp,
                                ),
                                MetricValue(
                                    name="memory.used_mb",
                                    value=used,
                                    unit="megabytes",
                                    timestamp=timestamp,
                                ),
                                MetricValue(
                                    name="memory.free_mb",
                                    value=free,
                                    unit="megabytes",
                                    timestamp=timestamp,
                                ),
                                MetricValue(
                                    name="memory.used_percent",
                                    value=(used / total) * 100,
                                    unit="percent",
                                    timestamp=timestamp,
                                ),
                            ]
                        )

        except Exception as e:
            logger.warning(f"Failed to get memory metrics: {e}")

        return metrics

    def get_disk_metrics(self) -> list[MetricValue]:
        """Get disk performance metrics

        Returns:
            List of disk metric values
        """
        metrics: list[MetricValue] = []
        timestamp = datetime.now()

        try:
            result = self.executor.execute("df -h /")

            if result.stdout:
                lines = result.stdout.strip().split("\n")
                if len(lines) >= 2:
                    parts = lines[1].split()
                    if len(parts) >= 5:
                        total_str = parts[1].replace("G", "").replace("M", "").replace("K", "")
                        used_str = parts[2].replace("G", "").replace("M", "").replace("K", "")
                        avail_str = parts[3].replace("G", "").replace("M", "").replace("K", "")
                        percent_str = parts[4].replace("%", "")

                        metrics.extend(
                            [
                                MetricValue(
                                    name="disk.total_gb",
                                    value=float(total_str),
                                    unit="gigabytes",
                                    timestamp=timestamp,
                                ),
                                MetricValue(
                                    name="disk.used_gb",
                                    value=float(used_str),
                                    unit="gigabytes",
                                    timestamp=timestamp,
                                ),
                                MetricValue(
                                    name="disk.available_gb",
                                    value=float(avail_str),
                                    unit="gigabytes",
                                    timestamp=timestamp,
                                ),
                                MetricValue(
                                    name="disk.used_percent",
                                    value=float(percent_str),
                                    unit="percent",
                                    timestamp=timestamp,
                                ),
                            ]
                        )

        except Exception as e:
            logger.warning(f"Failed to get disk metrics: {e}")

        return metrics

    def get_network_metrics(self) -> list[MetricValue]:
        """Get network performance metrics

        Returns:
            List of network metric values
        """
        metrics: list[MetricValue] = []
        timestamp = datetime.now()

        try:
            # Get interface statistics
            result = self.executor.execute("cat /proc/net/dev")

            if result.stdout:
                lines = result.stdout.strip().split("\n")
                for line in lines[2:]:  # Skip header lines
                    parts = line.split()
                    if len(parts) >= 17:
                        interface = parts[0].rstrip(":")
                        rx_bytes = int(parts[1])
                        tx_bytes = int(parts[9])

                        metrics.extend(
                            [
                                MetricValue(
                                    name="network.rx_bytes",
                                    value=float(rx_bytes),
                                    unit="bytes",
                                    timestamp=timestamp,
                                    labels={"interface": interface},
                                ),
                                MetricValue(
                                    name="network.tx_bytes",
                                    value=float(tx_bytes),
                                    unit="bytes",
                                    timestamp=timestamp,
                                    labels={"interface": interface},
                                ),
                            ]
                        )

        except Exception as e:
            logger.warning(f"Failed to get network metrics: {e}")

        return metrics

    def get_all_metrics(self) -> list[MetricValue]:
        """Get all performance metrics

        Returns:
            List of all metric values
        """
        metrics: list[MetricValue] = []

        metrics.extend(self.get_cpu_metrics())
        metrics.extend(self.get_memory_metrics())
        metrics.extend(self.get_disk_metrics())
        metrics.extend(self.get_network_metrics())

        return metrics


class AlertManager:
    """Manager for alert rules and notifications"""

    def __init__(self, executor: VyOSCommandExecutor):
        self.executor = executor
        self._rules: dict[str, AlertRule] = {}
        self._alerts: list[Alert] = []
        self._rule_counters: dict[str, int] = {}

    def add_rule(self, rule: AlertRule) -> None:
        """Add an alert rule"""
        self._rules[rule.id] = rule

    def remove_rule(self, rule_id: str) -> bool:
        """Remove an alert rule"""
        if rule_id in self._rules:
            del self._rules[rule_id]
            return True
        return False

    def get_rule(self, rule_id: str) -> AlertRule | None:
        """Get an alert rule by ID"""
        return self._rules.get(rule_id)

    def get_all_rules(self) -> list[AlertRule]:
        """Get all alert rules"""
        return list(self._rules.values())

    def get_alerts(
        self, severity: str | None = None, limit: int = 100
    ) -> list[Alert]:
        """Get alert history

        Args:
            severity: Optional severity filter
            limit: Maximum number of alerts to return

        Returns:
            List of alerts
        """
        alerts = self._alerts

        if severity:
            alerts = [a for a in alerts if a.severity == severity]

        return alerts[-limit:]  # Return most recent

    def check_metric(self, metric: MetricValue) -> list[Alert]:
        """Check a metric against all alert rules

        Args:
            metric: Metric value to check

        Returns:
            List of triggered alerts
        """
        triggered_alerts: list[Alert] = []

        for rule in self._rules.values():
            if not rule.enabled:
                continue

            if rule.metric_name != metric.name:
                continue

            if self._check_condition(metric.value, rule.condition, rule.threshold):
                self._rule_counters[rule.id] = self._rule_counters.get(rule.id, 0) + 1

                # Check if condition has been met for required duration
                if self._rule_counters[rule.id] * 10 >= rule.duration:  # Assume 10s interval
                    alert = Alert(
                        id=f"alert-{len(self._alerts)}",
                        rule_id=rule.id,
                        rule_name=rule.name,
                        severity=rule.severity,
                        message=f"{rule.name}: {metric.name} is {metric.value} {metric.unit} (threshold: {rule.threshold})",
                        metadata={"metric": metric.to_dict()},
                    )

                    self._alerts.append(alert)
                    triggered_alerts.append(alert)

                    rule.last_triggered = alert.triggered_at
                    self._rule_counters[rule.id] = 0

        return triggered_alerts

    def _check_condition(self, value: float, condition: str, threshold: float) -> bool:
        """Check if a value meets the condition"""
        if condition == ">":
            return value > threshold
        elif condition == "<":
            return value < threshold
        elif condition == ">=":
            return value >= threshold
        elif condition == "<=":
            return value <= threshold
        elif condition == "==":
            return value == threshold
        elif condition == "!=":
            return value != threshold

        return False

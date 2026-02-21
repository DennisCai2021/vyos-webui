"""Logs and monitoring API endpoints"""
import asyncio
import re
import uuid
from datetime import datetime, timedelta
from typing import Any, AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, field_validator
from loguru import logger

from app.services.logging_monitoring import (
    Alert,
    AlertRule,
    AlertManager,
    LogCollector,
    LogLevel,
    LogEntry,
    LogFilter,
    LogSourceType,
    LogParser,
    PerformanceMonitor,
    RealTimeLogStreamer,
)
from app.services.vyos_command import VyOSCommandExecutor
from app.services.vyos_ssh import VyOSSSHClient, VyOSSSHConfig
from app.core.config import settings

router = APIRouter(prefix="/logs", tags=["logs"])

# Global alert manager instance
_alert_manager: AlertManager | None = None


# Request/Response Models
class LogEntryResponse(BaseModel):
    """Log entry response model"""

    timestamp: str
    level: str
    source: str
    message: str
    source_type: str
    process: str | None = None
    pid: int | None = None
    hostname: str | None = None
    raw: str = ""


class LogQueryRequest(BaseModel):
    """Log query request model"""

    source_type: str = Field(default="system", description="Type of log source")
    level: str | None = Field(default=None, description="Log level filter")
    source: str | None = Field(default=None, description="Source filter")
    process: str | None = Field(default=None, description="Process filter")
    message_contains: str | None = Field(default=None, description="Message contains filter")
    start_time: str | None = Field(default=None, description="Start time ISO format")
    end_time: str | None = Field(default=None, description="End time ISO format")
    hostname: str | None = Field(default=None, description="Hostname filter")
    limit: int = Field(default=1000, ge=1, le=10000)
    offset: int = Field(default=0, ge=0)
    reverse: bool = Field(default=True, description="Newest first")

    @field_validator("source_type")
    @classmethod
    def validate_source_type(cls, v: str) -> str:
        valid_types = ["system", "kernel", "auth", "firewall", "vpn", "nginx", "custom"]
        if v not in valid_types:
            raise ValueError(f"source_type must be one of {valid_types}")
        return v

    @field_validator("level")
    @classmethod
    def validate_level(cls, v: str | None) -> str | None:
        if v is not None:
            valid_levels = ["debug", "info", "notice", "warning", "error", "critical", "alert", "emergency"]
            if v.lower() not in valid_levels:
                raise ValueError(f"level must be one of {valid_levels}")
        return v.lower() if v else None


class MetricResponse(BaseModel):
    """Metric value response model"""

    name: str
    value: float
    unit: str
    timestamp: str
    labels: dict[str, str] = {}


class AlertRuleRequest(BaseModel):
    """Alert rule request model"""

    name: str = Field(..., description="Alert rule name")
    metric_name: str = Field(..., description="Metric name to monitor")
    condition: str = Field(..., description="Condition: >, <, >=, <=, ==, !=")
    threshold: float = Field(..., description="Threshold value")
    duration: int = Field(default=60, ge=1, description="Duration in seconds")
    severity: str = Field(default="warning", description="Severity: info, warning, critical")
    enabled: bool = Field(default=True)
    description: str = Field(default="")
    actions: list[str] = Field(default_factory=list)

    @field_validator("condition")
    @classmethod
    def validate_condition(cls, v: str) -> str:
        valid_conditions = [">", "<", ">=", "<=", "==", "!="]
        if v not in valid_conditions:
            raise ValueError(f"condition must be one of {valid_conditions}")
        return v

    @field_validator("severity")
    @classmethod
    def validate_severity(cls, v: str) -> str:
        valid_severities = ["info", "warning", "critical"]
        if v.lower() not in valid_severities:
            raise ValueError(f"severity must be one of {valid_severities}")
        return v.lower()


class AlertRuleResponse(BaseModel):
    """Alert rule response model"""

    id: str
    name: str
    metric_name: str
    condition: str
    threshold: float
    duration: int
    severity: str
    enabled: bool
    description: str
    actions: list[str]
    created_at: str
    updated_at: str
    last_triggered: str | None = None


class AlertResponse(BaseModel):
    """Alert response model"""

    id: str
    rule_id: str
    rule_name: str
    severity: str
    message: str
    triggered_at: str
    resolved_at: str | None = None
    metadata: dict[str, Any] = {}


class SystemStatsResponse(BaseModel):
    """System statistics response"""

    cpu: dict[str, float | str]
    memory: dict[str, float | str]
    disk: dict[str, float | str]
    network: list[dict[str, Any]]
    uptime: dict[str, Any]


def _get_executor() -> VyOSCommandExecutor:
    """Get VyOS command executor from settings"""
    config = VyOSSSHConfig(
        host=settings.vyos_host,
        port=settings.vyos_port,
        username=settings.vyos_username,
        password=settings.vyos_password,
        timeout=settings.vyos_timeout,
    )
    ssh_client = VyOSSSHClient(config)
    return VyOSCommandExecutor(ssh_client)


def _get_alert_manager() -> AlertManager:
    """Get or create alert manager"""
    global _alert_manager
    if _alert_manager is None:
        executor = _get_executor()
        _alert_manager = AlertManager(executor)
    return _alert_manager


def _build_log_filter(request: LogQueryRequest) -> LogFilter:
    """Build log filter from request"""
    source_type = LogSourceType(request.source_type)
    level = LogLevel(request.level) if request.level else None

    start_time = None
    if request.start_time:
        start_time = datetime.fromisoformat(request.start_time)

    end_time = None
    if request.end_time:
        end_time = datetime.fromisoformat(request.end_time)

    return LogFilter(
        level=level,
        source_type=source_type,
        source=request.source,
        process=request.process,
        message_contains=request.message_contains,
        start_time=start_time,
        end_time=end_time,
        hostname=request.hostname,
        limit=request.limit,
        offset=request.offset,
        reverse=request.reverse,
    )


@router.post("/query", response_model=list[LogEntryResponse])
async def query_logs(request: LogQueryRequest) -> list[LogEntryResponse]:
    """Query logs from a specific source

    Args:
        request: Log query parameters

    Returns:
        List of log entries matching the filter
    """
    try:
        executor = _get_executor()
        collector = LogCollector(executor)

        filter = _build_log_filter(request)
        entries = collector.query_logs(LogSourceType(request.source_type), filter)

        return [LogEntryResponse(**entry.to_dict()) for entry in entries]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/system", response_model=list[LogEntryResponse])
async def get_system_logs(
    level: str | None = Query(None),
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
) -> list[LogEntryResponse]:
    """Get system logs

    Args:
        level: Log level filter
        limit: Maximum number of entries
        offset: Number of entries to skip

    Returns:
        List of system log entries
    """
    request = LogQueryRequest(source_type="system", level=level, limit=limit, offset=offset)
    try:
        executor = _get_executor()
        collector = LogCollector(executor)

        filter = _build_log_filter(request)
        entries = collector.query_logs(LogSourceType(request.source_type), filter)

        return [LogEntryResponse(**entry.to_dict()) for entry in entries]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/firewall", response_model=list[LogEntryResponse])
async def get_firewall_logs(
    level: str | None = Query(None),
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
) -> list[LogEntryResponse]:
    """Get firewall logs

    Args:
        level: Log level filter
        limit: Maximum number of entries
        offset: Number of entries to skip

    Returns:
        List of firewall log entries
    """
    try:
        executor = _get_executor()
        collector = LogCollector(executor)

        filter = _build_log_filter(
            LogQueryRequest(source_type="firewall", level=level, limit=limit, offset=offset)
        )
        entries = collector.get_firewall_logs(filter)

        return [LogEntryResponse(**entry.to_dict()) for entry in entries]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/vpn", response_model=list[LogEntryResponse])
async def get_vpn_logs(
    vpn_type: str = Query("all", description="Type of VPN: openvpn, ipsec, wireguard, all"),
    level: str | None = Query(None),
    limit: int = Query(100, ge=1, le=10000),
    offset: int = Query(0, ge=0),
) -> list[LogEntryResponse]:
    """Get VPN logs

    Args:
        vpn_type: Type of VPN
        level: Log level filter
        limit: Maximum number of entries
        offset: Number of entries to skip

    Returns:
        List of VPN log entries
    """
    try:
        executor = _get_executor()
        collector = LogCollector(executor)

        filter = _build_log_filter(
            LogQueryRequest(source_type="vpn", level=level, limit=limit, offset=offset)
        )
        entries = collector.get_vpn_logs(vpn_type, filter)

        return [LogEntryResponse(**entry.to_dict()) for entry in entries]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/stream/{source_type}")
async def stream_logs(
    source_type: str,
):
    """Stream logs in real-time using Server-Sent Events

    Args:
        source_type: Type of log source (system, firewall, vpn)

    Returns:
        Streaming response with log entries
    """
    async def log_generator() -> AsyncGenerator[str, None]:
        """Generate log entries for SSE"""
        try:
            executor = _get_executor()
            streamer = RealTimeLogStreamer(executor)

            async for entry in streamer.stream_logs(LogSourceType(source_type)):
                data = entry.to_dict()
                yield f"data: {data}\n\n"

                # Small delay to avoid overwhelming the client
                await asyncio.sleep(0.1)

        except Exception as e:
            logger.error(f"Error streaming logs: {e}")
            yield f"event: error\ndata: {{'error': '{str(e)}'}}\n\n"

    try:
        return StreamingResponse(
            log_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
            },
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/metrics/cpu", response_model=list[MetricResponse])
async def get_cpu_metrics() -> list[MetricResponse]:
    """Get CPU performance metrics

    Returns:
        List of CPU metric values
    """
    try:
        executor = _get_executor()
        monitor = PerformanceMonitor(executor)
        metrics = monitor.get_cpu_metrics()

        return [MetricResponse(**metric.to_dict()) for metric in metrics]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/metrics/memory", response_model=list[MetricResponse])
async def get_memory_metrics() -> list[MetricResponse]:
    """Get memory performance metrics

    Returns:
        List of memory metric values
    """
    try:
        executor = _get_executor()
        monitor = PerformanceMonitor(executor)
        metrics = monitor.get_memory_metrics()

        return [MetricResponse(**metric.to_dict()) for metric in metrics]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/metrics/disk", response_model=list[MetricResponse])
async def get_disk_metrics() -> list[MetricResponse]:
    """Get disk performance metrics

    Returns:
        List of disk metric values
    """
    try:
        executor = _get_executor()
        monitor = PerformanceMonitor(executor)
        metrics = monitor.get_disk_metrics()

        return [MetricResponse(**metric.to_dict()) for metric in metrics]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/metrics/network", response_model=list[MetricResponse])
async def get_network_metrics() -> list[MetricResponse]:
    """Get network performance metrics

    Returns:
        List of network metric values
    """
    try:
        executor = _get_executor()
        monitor = PerformanceMonitor(executor)
        metrics = monitor.get_network_metrics()

        return [MetricResponse(**metric.to_dict()) for metric in metrics]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/metrics", response_model=list[MetricResponse])
async def get_all_metrics() -> list[MetricResponse]:
    """Get all performance metrics

    Returns:
        List of all metric values
    """
    try:
        executor = _get_executor()
        monitor = PerformanceMonitor(executor)
        metrics = monitor.get_all_metrics()

        return [MetricResponse(**metric.to_dict()) for metric in metrics]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/stats", response_model=SystemStatsResponse)
async def get_system_stats() -> SystemStatsResponse:
    """Get comprehensive system statistics

    Returns:
        System statistics including CPU, memory, disk, network, and uptime
    """
    try:
        executor = _get_executor()
        monitor = PerformanceMonitor(executor)

        cpu_metrics = monitor.get_cpu_metrics()
        memory_metrics = monitor.get_memory_metrics()
        disk_metrics = monitor.get_disk_metrics()
        network_metrics = monitor.get_network_metrics()

        # Format metrics for response
        cpu = {m.name: m.value for m in cpu_metrics}
        memory = {m.name: m.value for m in memory_metrics}
        disk = {m.name: m.value for m in disk_metrics}

        network = []
        for m in network_metrics:
            if "interface" in m.labels:
                network.append({
                    "interface": m.labels["interface"],
                    m.name: m.value,
                    "unit": m.unit,
                })

        # Get uptime
        result = executor.execute("cat /proc/uptime")
        uptime_seconds = 0
        if result.stdout:
            match = re.search(r"^(\d+\.?\d*)", result.stdout)
            if match:
                uptime_seconds = float(match.group(1))

        # Format uptime string
        uptime_str = ""
        days = int(uptime_seconds // 86400)
        hours = int((uptime_seconds % 86400) // 3600)
        minutes = int((uptime_seconds % 3600) // 60)

        if days > 0:
            uptime_str = f"{days}d {hours}h {minutes}m"
        elif hours > 0:
            uptime_str = f"{hours}h {minutes}m"
        else:
            uptime_str = f"{minutes}m"

        uptime = {
            "uptime_seconds": uptime_seconds,
            "uptime_string": uptime_str,
        }

        return SystemStatsResponse(cpu=cpu, memory=memory, disk=disk, network=network, uptime=uptime)
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# Alert Management Endpoints
@router.post("/alerts/rules", response_model=AlertRuleResponse)
async def create_alert_rule(request: AlertRuleRequest) -> AlertRuleResponse:
    """Create a new alert rule

    Args:
        request: Alert rule configuration

    Returns:
        Created alert rule
    """
    try:
        manager = _get_alert_manager()

        rule = AlertRule(
            id=str(uuid.uuid4()),
            name=request.name,
            metric_name=request.metric_name,
            condition=request.condition,
            threshold=request.threshold,
            duration=request.duration,
            severity=request.severity,
            enabled=request.enabled,
            description=request.description,
            actions=request.actions,
        )

        manager.add_rule(rule)

        return AlertRuleResponse(**rule.to_dict())
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/alerts/rules", response_model=list[AlertRuleResponse])
async def get_alert_rules() -> list[AlertRuleResponse]:
    """Get all alert rules

    Returns:
        List of alert rules
    """
    try:
        manager = _get_alert_manager()
        rules = manager.get_all_rules()

        return [AlertRuleResponse(**rule.to_dict()) for rule in rules]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/alerts/rules/{rule_id}", response_model=AlertRuleResponse)
async def get_alert_rule(rule_id: str) -> AlertRuleResponse:
    """Get an alert rule by ID

    Args:
        rule_id: Alert rule ID

    Returns:
        Alert rule details
    """
    try:
        manager = _get_alert_manager()
        rule = manager.get_rule(rule_id)

        if not rule:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found")

        return AlertRuleResponse(**rule.to_dict())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/alerts/rules/{rule_id}")
async def delete_alert_rule(rule_id: str) -> dict[str, str]:
    """Delete an alert rule

    Args:
        rule_id: Alert rule ID

    Returns:
        Deletion confirmation
    """
    try:
        manager = _get_alert_manager()
        deleted = manager.remove_rule(rule_id)

        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found")

        return {"message": "Alert rule deleted successfully", "rule_id": rule_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.put("/alerts/rules/{rule_id}", response_model=AlertRuleResponse)
async def update_alert_rule(rule_id: str, request: AlertRuleRequest) -> AlertRuleResponse:
    """Update an alert rule

    Args:
        rule_id: Alert rule ID
        request: Updated alert rule configuration

    Returns:
        Updated alert rule
    """
    try:
        manager = _get_alert_manager()
        existing = manager.get_rule(rule_id)

        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Alert rule not found")

        # Update existing rule
        rule = AlertRule(
            id=rule_id,
            name=request.name,
            metric_name=request.metric_name,
            condition=request.condition,
            threshold=request.threshold,
            duration=request.duration,
            severity=request.severity,
            enabled=request.enabled,
            description=request.description,
            actions=request.actions,
            created_at=existing.created_at,
            updated_at=datetime.now(),
            last_triggered=existing.last_triggered,
        )

        manager.add_rule(rule)

        return AlertRuleResponse(**rule.to_dict())
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/alerts", response_model=list[AlertResponse])
async def get_alerts(
    severity: str | None = Query(None, description="Filter by severity"),
    limit: int = Query(100, ge=1, le=1000),
) -> list[AlertResponse]:
    """Get alert history

    Args:
        severity: Optional severity filter
        limit: Maximum number of alerts

    Returns:
        List of alerts
    """
    try:
        manager = _get_alert_manager()
        alerts = manager.get_alerts(severity=severity, limit=limit)

        return [AlertResponse(**alert.to_dict()) for alert in alerts]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/alerts/test")
async def test_alert_rule(request: AlertRuleRequest) -> dict[str, Any]:
    """Test an alert rule against current metrics

    Args:
        request: Alert rule to test

    Returns:
        Test results including current metric value and whether it would trigger
    """
    try:
        executor = _get_executor()
        monitor = PerformanceMonitor(executor)
        manager = _get_alert_manager()

        # Get all metrics
        all_metrics = monitor.get_all_metrics()

        # Find the metric
        target_metric = None
        for metric in all_metrics:
            if metric.name == request.metric_name:
                target_metric = metric
                break

        if not target_metric:
            return {
                "metric_name": request.metric_name,
                "found": False,
                "message": f"Metric '{request.metric_name}' not found in current metrics",
            }

        # Create a temporary rule to check
        rule = AlertRule(
            id="test-rule",
            name=request.name,
            metric_name=request.metric_name,
            condition=request.condition,
            threshold=request.threshold,
            duration=request.duration,
            severity=request.severity,
        )

        # Check condition
        would_trigger = manager._check_condition(
            target_metric.value, rule.condition, rule.threshold
        )

        return {
            "metric_name": request.metric_name,
            "found": True,
            "current_value": target_metric.value,
            "unit": target_metric.unit,
            "condition": request.condition,
            "threshold": request.threshold,
            "would_trigger": would_trigger,
            "message": (
                f"Alert would trigger: {would_trigger}"
                if would_trigger
                else f"Alert would not trigger (current: {target_metric.value}, threshold: {request.threshold})"
            ),
        }
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))

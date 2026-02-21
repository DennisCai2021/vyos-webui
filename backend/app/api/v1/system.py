"""System information API endpoints"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.services.system_info import SystemInfoCollector
from app.services.vyos_command import VyOSCommandExecutor
from app.services.vyos_ssh import VyOSSSHClient, VyOSSSHConfig
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/system", tags=["system"])


class SystemInfoResponse(BaseModel):
    """System information response"""

    version: dict
    hardware: dict
    uptime: dict


class HardwareInfoResponse(BaseModel):
    """Hardware information response"""

    cpu_model: str | None = None
    cpu_cores: int | None = None
    cpu_speed: str | None = None
    memory_total: int | None = None
    memory_used: int | None = None
    memory_free: int | None = None
    disk_total: int | None = None
    disk_used: int | None = None
    disk_free: int | None = None


class UptimeResponse(BaseModel):
    """Uptime information response"""

    uptime_seconds: int
    uptime_string: str
    load_average_1m: float
    load_average_5m: float
    load_average_15m: float


class ServiceStatusResponse(BaseModel):
    """Service status response"""

    name: str
    status: str
    pid: int | None = None
    cpu_percent: float | None = None
    memory_percent: float | None = None


def _get_executor() -> VyOSCommandExecutor:
    """Get VyOS command executor from settings"""
    if not settings.vyos_host:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="VyOS host not configured. Please check VYOS_HOST environment variable."
        )
    config = VyOSSSHConfig(
        host=settings.vyos_host,
        port=settings.vyos_port,
        username=settings.vyos_username,
        password=settings.vyos_password,
        timeout=settings.vyos_timeout,
    )
    ssh_client = VyOSSSHClient(config)
    return VyOSCommandExecutor(ssh_client)


@router.get("/info", response_model=SystemInfoResponse)
async def get_system_info() -> SystemInfoResponse:
    """Get complete system information"""
    try:
        executor = _get_executor()
        collector = SystemInfoCollector(executor)
        info = collector.get_all_info()

        return SystemInfoResponse(
            version={
                "version": info["version"].version,
                "build_date": info["version"].build_date,
                "description": info["version"].description,
                "kernel": info["version"].kernel,
                "architecture": info["version"].architecture,
            },
            hardware={
                "cpu_model": info["hardware"].cpu_model,
                "cpu_cores": info["hardware"].cpu_cores,
                "cpu_speed": info["hardware"].cpu_speed,
                "memory_total": info["hardware"].memory_total,
                "memory_used": info["hardware"].memory_used,
                "memory_free": info["hardware"].memory_free,
                "disk_total": info["hardware"].disk_total,
                "disk_used": info["hardware"].disk_used,
                "disk_free": info["hardware"].disk_free,
            },
            uptime={
                "uptime_seconds": info["uptime"].uptime_seconds,
                "uptime_string": info["uptime"].uptime_string,
                "load_average_1m": info["uptime"].load_average_1m,
                "load_average_5m": info["uptime"].load_average_5m,
                "load_average_15m": info["uptime"].load_average_15m,
            },
        )
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in get_system_info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve system information: {str(e)}"
        )


@router.get("/version")
async def get_version():
    """Get VyOS version information"""
    try:
        executor = _get_executor()
        collector = SystemInfoCollector(executor)
        version = collector.get_version()

        return {
            "version": version.version,
            "build_date": version.build_date,
            "description": version.description,
            "kernel": version.kernel,
            "architecture": version.architecture,
            "serial_number": version.serial_number,
        }
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in get_version: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve version information: {str(e)}"
        )


@router.get("/hardware", response_model=HardwareInfoResponse)
async def get_hardware_info() -> HardwareInfoResponse:
    """Get system hardware information"""
    try:
        executor = _get_executor()
        collector = SystemInfoCollector(executor)
        hardware = collector.get_hardware_info()

        return HardwareInfoResponse(
            cpu_model=hardware.cpu_model,
            cpu_cores=hardware.cpu_cores,
            cpu_speed=hardware.cpu_speed,
            memory_total=hardware.memory_total,
            memory_used=hardware.memory_used,
            memory_free=hardware.memory_free,
            disk_total=hardware.disk_total,
            disk_used=hardware.disk_used,
            disk_free=hardware.disk_free,
        )
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in get_hardware_info: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve hardware information: {str(e)}"
        )


@router.get("/uptime", response_model=UptimeResponse)
async def get_uptime() -> UptimeResponse:
    """Get system uptime and load average"""
    try:
        executor = _get_executor()
        collector = SystemInfoCollector(executor)
        uptime = collector.get_uptime()

        return UptimeResponse(
            uptime_seconds=uptime.uptime_seconds,
            uptime_string=uptime.uptime_string,
            load_average_1m=uptime.load_average_1m,
            load_average_5m=uptime.load_average_5m,
            load_average_15m=uptime.load_average_15m,
        )
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in get_uptime: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve uptime information: {str(e)}"
        )


@router.get("/services", response_model=list[ServiceStatusResponse])
async def get_services(service_name: str | None = None) -> list[ServiceStatusResponse]:
    """Get system service status

    Args:
        service_name: Optional service name filter
    """
    try:
        executor = _get_executor()
        collector = SystemInfoCollector(executor)
        services = collector.get_service_status(service_name)

        return [
            ServiceStatusResponse(
                name=svc.name,
                status=svc.status,
                pid=svc.pid,
                cpu_percent=svc.cpu_percent,
                memory_percent=svc.memory_percent,
            )
            for svc in services
        ]
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in get_services: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve service status: {str(e)}"
        )

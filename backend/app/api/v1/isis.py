"""IS-IS API - IS-IS protocol configuration"""
import logging
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional, Any

from app.services.vyos_ssh import VyOSSSHClient, VyOSSSHConfig
from app.services.vyos_config_service import VyOSConfigService
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/isis", tags=["isis"])


# Helper Functions
def _get_ssh_config() -> VyOSSSHConfig:
    """Get VyOS SSH config"""
    if not settings.vyos_host:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="VyOS host not configured. Please check VYOS_HOST environment variable."
        )
    return VyOSSSHConfig(
        host=settings.vyos_host,
        port=settings.vyos_port,
        username=settings.vyos_username,
        password=settings.vyos_password,
        timeout=settings.vyos_timeout,
    )


# Models
class ISISConfigResponse(BaseModel):
    net: Optional[str] = None
    level: Optional[str] = None
    metric_style: Optional[str] = None
    purge_originator: bool = False
    set_overload_bit: bool = False
    ldp_sync: bool = False
    ldp_sync_holddown: Optional[int] = None
    spf_interval: Optional[int] = None
    interfaces: List[dict] = []
    redistribute: List[dict] = []


class ISISGlobalConfigRequest(BaseModel):
    net: Optional[str] = None
    level: Optional[str] = None
    metric_style: Optional[str] = None
    purge_originator: Optional[bool] = None
    set_overload_bit: Optional[bool] = None
    spf_interval: Optional[int] = None


class ISISInterfaceRequest(BaseModel):
    interface: str
    circuit_type: Optional[str] = None
    hello_interval: Optional[int] = None
    hello_multiplier: Optional[int] = None
    metric: Optional[int] = None
    passive: bool = False
    priority: Optional[int] = None


class ISISInterfaceUpdateRequest(BaseModel):
    circuit_type: Optional[str] = None
    hello_interval: Optional[int] = None
    hello_multiplier: Optional[int] = None
    metric: Optional[int] = None
    passive: Optional[bool] = None
    priority: Optional[int] = None


class ISISRedistributeRequest(BaseModel):
    source: str
    level: str
    route_map: Optional[str] = None


class ISISInitialSetupRequest(BaseModel):
    """Request for initial IS-IS setup (includes first interface)"""
    net: str
    level: Optional[str] = None
    metric_style: Optional[str] = None
    interface: str
    interface_circuit_type: Optional[str] = None
    interface_metric: Optional[int] = None
    interface_passive: bool = False


# IS-IS Endpoints
@router.get("/config", response_model=ISISConfigResponse)
async def get_isis_config():
    """Get IS-IS configuration"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            config = config_service.get_isis_config()

            return ISISConfigResponse(
                net=config.get('net'),
                level=config.get('level'),
                metric_style=config.get('metric_style'),
                purge_originator=config.get('purge_originator', False),
                set_overload_bit=config.get('set_overload_bit', False),
                ldp_sync=config.get('ldp_sync', False),
                ldp_sync_holddown=config.get('ldp_sync_holddown'),
                spf_interval=config.get('spf_interval'),
                interfaces=config.get('interfaces', []),
                redistribute=config.get('redistribute', [])
            )
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in get_isis_config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve IS-IS config: {str(e)}"
        )


@router.post("/setup")
async def initial_isis_setup(request: ISISInitialSetupRequest):
    """Initial IS-IS setup - sets NET and first interface in single commit"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            from app.services.vyos_config import VyOSConfigSession

            session = VyOSConfigSession(ssh_client)
            session.open()
            session.enter_config_mode()

            try:
                # Clean up any existing
                session._send_and_sleep("delete protocols isis", 0.3)

                # Set NET
                session._send_and_sleep(f"set protocols isis net {request.net}", 0.3)

                # Set optional global config
                if request.level:
                    session._send_and_sleep(f"set protocols isis level {request.level}", 0.2)
                if request.metric_style:
                    session._send_and_sleep(f"set protocols isis metric-style {request.metric_style}", 0.2)

                # Set interface
                base = f"protocols isis interface {request.interface}"
                session._send_and_sleep(f"set {base}", 0.2)
                if request.interface_circuit_type:
                    session._send_and_sleep(f"set {base} circuit-type {request.interface_circuit_type}", 0.2)
                if request.interface_metric:
                    session._send_and_sleep(f"set {base} metric {request.interface_metric}", 0.2)
                if request.interface_passive:
                    session._send_and_sleep(f"set {base} passive", 0.2)

                # Commit all together!
                result = session.commit(comment="Initial IS-IS setup")

                if not result:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Failed to commit IS-IS configuration"
                    )

                return {
                    "message": "IS-IS setup successfully!",
                    "net": request.net,
                    "interface": request.interface
                }
            finally:
                session.close()
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in initial_isis_setup: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to setup IS-IS: {str(e)}"
        )


@router.put("/config")
async def update_isis_config(request: ISISGlobalConfigRequest):
    """Update IS-IS global configuration"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)

            # Handle disable case first
            if request.net is not None and not request.net:
                # Disable IS-IS if net is empty
                success = config_service.disable_isis()
                if not success:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="Failed to disable IS-IS"
                    )
                return {
                    "message": "IS-IS disabled successfully",
                    "net": None
                }

            # Update global config using single session method
            success = config_service.update_isis_global_config(
                net=request.net,
                level=request.level,
                metric_style=request.metric_style,
                purge_originator=request.purge_originator,
                set_overload_bit=request.set_overload_bit,
                spf_interval=request.spf_interval
            )

            if not success:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Failed to commit IS-IS configuration. IS-IS requires at least one interface to be configured before committing global settings."
                )

            return {
                "message": "IS-IS config updated successfully",
                "net": request.net,
                "level": request.level,
                "metric_style": request.metric_style
            }
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in update_isis_config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update IS-IS config: {str(e)}"
        )


@router.delete("/config")
async def disable_isis():
    """Disable IS-IS completely"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.disable_isis()

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to disable IS-IS")

            return {"message": "IS-IS disabled successfully"}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in disable_isis: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to disable IS-IS: {str(e)}"
        )


# Interface Endpoints
@router.post("/interfaces")
async def add_isis_interface(request: ISISInterfaceRequest):
    """Add an interface to IS-IS"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.add_isis_interface(
                interface=request.interface,
                circuit_type=request.circuit_type,
                hello_interval=request.hello_interval,
                hello_multiplier=request.hello_multiplier,
                metric=request.metric,
                passive=request.passive,
                priority=request.priority
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to add IS-IS interface - commit failed")

            return {
                "message": "IS-IS interface added successfully",
                "interface": request.interface
            }
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in add_isis_interface: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add IS-IS interface: {str(e)}"
        )


@router.put("/interfaces/{interface}")
async def update_isis_interface(interface: str, request: ISISInterfaceUpdateRequest):
    """Update an IS-IS interface"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)

            update_kwargs = {}
            if request.circuit_type is not None:
                update_kwargs['circuit_type'] = request.circuit_type
            if request.hello_interval is not None:
                update_kwargs['hello_interval'] = request.hello_interval
            if request.hello_multiplier is not None:
                update_kwargs['hello_multiplier'] = request.hello_multiplier
            if request.metric is not None:
                update_kwargs['metric'] = request.metric
            if request.passive is not None:
                update_kwargs['passive'] = request.passive
            if request.priority is not None:
                update_kwargs['priority'] = request.priority

            success = config_service.update_isis_interface(interface, **update_kwargs)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to update IS-IS interface - commit failed")

            return {
                "message": "IS-IS interface updated successfully",
                "interface": interface
            }
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in update_isis_interface: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update IS-IS interface: {str(e)}"
        )


@router.delete("/interfaces/{interface}")
async def delete_isis_interface(interface: str):
    """Remove an interface from IS-IS"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.delete_isis_interface(interface)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to remove IS-IS interface - commit failed")

            return {
                "message": "IS-IS interface removed successfully",
                "interface": interface
            }
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in delete_isis_interface: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove IS-IS interface: {str(e)}"
        )


# Redistribution Endpoints
@router.post("/redistribute")
async def add_isis_redistribute(request: ISISRedistributeRequest):
    """Add route redistribution to IS-IS"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.add_isis_redistribute(
                source=request.source,
                level=request.level,
                route_map=request.route_map
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to add IS-IS redistribution - commit failed")

            return {
                "message": "IS-IS redistribution added successfully",
                "source": request.source,
                "level": request.level
            }
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in add_isis_redistribute: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add IS-IS redistribution: {str(e)}"
        )


@router.delete("/redistribute/{source}/{level}")
async def delete_isis_redistribute(source: str, level: str):
    """Remove route redistribution from IS-IS"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.delete_isis_redistribute(source, level)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to remove IS-IS redistribution - commit failed")

            return {
                "message": "IS-IS redistribution removed successfully",
                "source": source,
                "level": level
            }
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in delete_isis_redistribute: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove IS-IS redistribution: {str(e)}"
        )


@router.get("/status")
async def get_isis_status():
    """Get IS-IS status overview (interfaces, database, etc.)"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            status = config_service.get_isis_status()
            return status
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in get_isis_status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get IS-IS status: {str(e)}"
        )

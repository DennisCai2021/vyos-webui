"""Network configuration API endpoints"""
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.services.network import NetworkConfigService
from app.services.vyos_command import VyOSCommandExecutor
from app.services.vyos_ssh import VyOSSSHClient, VyOSSSHConfig
from app.services.vyos_config_service import VyOSConfigService
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/network", tags=["network"])


# Request/Response Models

class InterfaceRequest(BaseModel):
    """Interface creation request"""

    name: str
    type: str = "ethernet"  # 'ethernet', 'loopback', 'bridge', 'bonding', 'vlan', 'pppoe'
    description: str | None = None
    mtu: int | None = None
    vrf: str | None = None
    parent: str | None = None  # For VLAN and PPPoE
    vlan_id: int | None = None  # For VLAN


class InterfaceUpdateRequest(BaseModel):
    """Interface update request (no name required - in URL path)"""

    type: str | None = None
    description: str | None = None
    mtu: int | None = None
    vrf: str | None = None
    parent: str | None = None
    vlan_id: int | None = None


class InterfaceResponse(BaseModel):
    """Interface response"""

    name: str
    type: str
    description: str | None = None
    status: str = "down"
    mtu: int = 1500
    mac_address: str | None = None
    ip_addresses: list[dict] | None = None
    vrf: str | None = None
    speed: str | None = None
    duplex: str | None = None
    # For VLAN interfaces
    parent_interface: str | None = None
    vlan_id: int | None = None


class VLANInterfaceRequest(BaseModel):
    """VLAN interface creation request"""

    name: str
    parent_interface: str
    vlan_id: int
    description: str | None = None
    mtu: int | None = None


class VLANInterfaceUpdateRequest(BaseModel):
    """VLAN interface update request"""

    description: str | None = None
    mtu: int | None = None


class PPPoEInterfaceRequest(BaseModel):
    """PPPoE interface creation request"""

    name: str
    source_interface: str
    username: str
    password: str
    description: str | None = None
    mtu: int | None = None
    default_route: bool = True
    name_servers: bool = True


class PPPoEInterfaceUpdateRequest(BaseModel):
    """PPPoE interface update request"""

    source_interface: str | None = None
    username: str | None = None
    password: str | None = None
    description: str | None = None
    mtu: int | None = None
    default_route: bool | None = None
    name_servers: bool | None = None


class IPAddressRequest(BaseModel):
    """IP address request"""

    address: str


class IPAddressResponse(BaseModel):
    """IP address response"""

    address: str
    gateway: str | None = None
    vrf: str | None = None


class RouteRequest(BaseModel):
    """Route request"""

    destination: str
    next_hop: str | None = None
    interface: str | None = None
    distance: int = 1
    metric: int = 0


class RouteResponse(BaseModel):
    """Route response"""

    destination: str
    next_hop: str | None = None
    interface: str | None = None
    distance: int = 1
    metric: int = 0
    route_type: str = "static"


class RouteSummaryResponse(BaseModel):
    """Detailed route summary response"""

    destination: str
    next_hop: str | None = None
    interface: str | None = None
    route_type: str  # 'static', 'connected', 'kernel', 'ospf', 'isis', 'bgp', etc.
    route_source: str  # Full source description
    is_selected: bool = False  # > - selected route
    is_fib: bool = False  # * - FIB route
    is_queued: bool = False  # q - queued
    is_rejected: bool = False  # r - rejected
    is_backup: bool = False  # b - backup
    is_trapped: bool = False  # t - trapped
    is_offload_failure: bool = False  # o - offload failure
    age: str | None = None  # Route age, e.g., "2d03h45m"
    distance: int = 1
    metric: int = 0
    status: str = "unknown"  # 'active', 'inactive', 'selected'


class ARPEntryResponse(BaseModel):
    """ARP entry response"""

    ip_address: str
    mac_address: str
    interface: str
    age: int | None = None
    state: str = "REACHABLE"


class DNSServerResponse(BaseModel):
    """DNS server response"""

    server: str
    vrf: str | None = None
    priority: int = 0


class DNSConfigResponse(BaseModel):
    """DNS configuration response"""

    domain_name: str | None = None
    name_servers: list[DNSServerResponse] | None = None


class DNSSetRequest(BaseModel):
    """DNS set request"""

    servers: list[str]
    vrf: str | None = None


class DomainNameRequest(BaseModel):
    """Domain name request"""

    domain: str


class DnsMappingRequest(BaseModel):
    """DNS mapping request"""

    hostname: str
    ip_address: str


# Helper Functions

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


def _get_network_service() -> NetworkConfigService:
    """Get network configuration service"""
    return NetworkConfigService(_get_executor())


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


# === VLAN Interface Endpoints - MUST COME BEFORE /interfaces/{name} ===

@router.post("/interfaces/vlan")
async def create_vlan_interface(request: VLANInterfaceRequest):
    """Create a VLAN interface"""
    try:
        # Validate VLAN ID
        if not (1 <= request.vlan_id <= 4094):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="VLAN ID must be between 1 and 4094"
            )

        # Use VyOSConfigService for reliable configuration
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.create_vlan_interface(
                request.name,
                request.parent_interface,
                request.vlan_id,
                description=request.description,
                mtu=request.mtu
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create VLAN interface")

            return {
                "message": "VLAN interface created successfully",
                "name": request.name,
                "vlan_id": request.vlan_id,
                "parent_interface": request.parent_interface
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
        logger.error(f"Error in create_vlan_interface: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create VLAN interface: {str(e)}"
        )


@router.put("/interfaces/vlan/{name}")
async def update_vlan_interface(name: str, request: VLANInterfaceUpdateRequest):
    """Update a VLAN interface"""
    try:
        # Use VyOSConfigService for reliable configuration
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.update_vlan_interface(
                name,
                description=request.description,
                mtu=request.mtu
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to update VLAN interface")

            return {"message": "VLAN interface updated successfully", "name": name}
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
        logger.error(f"Error in update_vlan_interface: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update VLAN interface: {str(e)}"
        )


@router.delete("/interfaces/vlan/{name}")
async def delete_vlan_interface(name: str):
    """Delete a VLAN interface"""
    try:
        # Use VyOSConfigService for reliable configuration
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.delete_vlan_interface(name)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete VLAN interface")

            return {"message": "VLAN interface deleted successfully", "name": name}
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
        logger.error(f"Error in delete_vlan_interface: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete VLAN interface: {str(e)}"
        )


@router.post("/interfaces/vlan/{name}/ip-addresses")
async def add_ip_to_vlan(name: str, request: IPAddressRequest):
    """Add an IP address to a VLAN interface"""
    try:
        # Use VyOSConfigService for reliable configuration
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.add_ip_to_vlan(name, request.address)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to add IP address to VLAN")

            return {"message": "IP address added to VLAN successfully", "name": name, "address": request.address}
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
        logger.error(f"Error in add_ip_to_vlan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add IP address to VLAN: {str(e)}"
        )


@router.delete("/interfaces/vlan/{name}/ip-addresses/{address:path}")
async def remove_ip_from_vlan(name: str, address: str):
    """Remove an IP address from a VLAN interface"""
    try:
        # Use VyOSConfigService for reliable configuration
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.remove_ip_from_vlan(name, address)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to remove IP address from VLAN")

            return {"message": "IP address removed from VLAN successfully", "name": name, "address": address}
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
        logger.error(f"Error in remove_ip_from_vlan: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove IP address from VLAN: {str(e)}"
        )


# === PPPoE Interface Endpoints ===

@router.get("/interfaces/pppoe")
async def get_pppoe_config():
    """Get PPPoE interfaces configuration"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            config = config_service.get_pppoe_config()
            return config
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
        logger.error(f"Error in get_pppoe_config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve PPPoE config: {str(e)}"
        )


@router.get("/interfaces/pppoe/status")
async def get_pppoe_status():
    """Get PPPoE interfaces status"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            status = config_service.get_pppoe_status()
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
        logger.error(f"Error in get_pppoe_status: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve PPPoE status: {str(e)}"
        )


@router.post("/interfaces/pppoe")
async def create_pppoe_interface(request: PPPoEInterfaceRequest):
    """Create a PPPoE interface"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.create_pppoe_interface(
                request.name,
                request.source_interface,
                request.username,
                request.password,
                description=request.description,
                mtu=request.mtu,
                default_route=request.default_route,
                name_servers=request.name_servers
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create PPPoE interface")

            return {
                "message": "PPPoE interface created successfully",
                "name": request.name
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
        logger.error(f"Error in create_pppoe_interface: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create PPPoE interface: {str(e)}"
        )


@router.put("/interfaces/pppoe/{name}")
async def update_pppoe_interface(name: str, request: PPPoEInterfaceUpdateRequest):
    """Update a PPPoE interface"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.update_pppoe_interface(
                name,
                source_interface=request.source_interface,
                username=request.username,
                password=request.password,
                description=request.description,
                mtu=request.mtu,
                default_route=request.default_route,
                name_servers=request.name_servers
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to update PPPoE interface")

            return {"message": "PPPoE interface updated successfully", "name": name}
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
        logger.error(f"Error in update_pppoe_interface: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update PPPoE interface: {str(e)}"
        )


@router.delete("/interfaces/pppoe/{name}")
async def delete_pppoe_interface(name: str):
    """Delete a PPPoE interface"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.delete_pppoe_interface(name)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete PPPoE interface")

            return {"message": "PPPoE interface deleted successfully", "name": name}
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
        logger.error(f"Error in delete_pppoe_interface: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete PPPoE interface: {str(e)}"
        )


# Interface Endpoints

@router.get("/interfaces", response_model=list[InterfaceResponse])
async def list_interfaces():
    """List all network interfaces"""
    try:
        service = _get_network_service()
        interfaces = service.get_interfaces()

        return [
            InterfaceResponse(
                name=iface.name,
                type=iface.type,
                description=iface.description,
                status=iface.status,
                mtu=iface.mtu,
                mac_address=iface.mac_address,
                ip_addresses=iface.ip_addresses,
                vrf=iface.vrf,
                speed=iface.speed,
                duplex=iface.duplex,
            )
            for iface in interfaces
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
        logger.error(f"Error in list_interfaces: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve interfaces: {str(e)}"
        )


@router.get("/interfaces/{name}", response_model=InterfaceResponse)
async def get_interface(name: str):
    """Get specific interface details"""
    try:
        service = _get_network_service()
        iface = service.get_interface(name)

        if not iface:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Interface {name} not found")

        return InterfaceResponse(
            name=iface.name,
            type=iface.type,
            description=iface.description,
            status=iface.status,
            mtu=iface.mtu,
            mac_address=iface.mac_address,
            ip_addresses=iface.ip_addresses,
            vrf=iface.vrf,
            speed=iface.speed,
            duplex=iface.duplex,
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
        logger.error(f"Error in get_interface: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve interface: {str(e)}"
        )


@router.post("/interfaces")
async def create_interface(request: InterfaceRequest):
    """Create a new network interface"""
    try:
        # Use VyOSConfigService for reliable configuration
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)

            commands = []
            if request.description:
                commands.append(f"set interfaces {request.type} {request.name} description '{request.description}'")
            if request.mtu:
                commands.append(f"set interfaces {request.type} {request.name} mtu {request.mtu}")

            if commands:
                success = config_service.batch(commands, comment=f"Create interface {request.name}")
                if not success:
                    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create interface")

            return {"message": "Interface created successfully", "name": request.name}
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
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error in create_interface: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create interface: {str(e)}"
        )


@router.put("/interfaces/{name}")
async def update_interface(name: str, request: InterfaceUpdateRequest):
    """Update an existing interface"""
    try:
        # First, get interface type from reading
        read_service = _get_network_service()
        interfaces = read_service.get_interfaces()
        iface = next((i for i in interfaces if i.name == name), None)
        iface_type = iface.type if iface else request.type or "ethernet"

        # Use VyOSConfigService for reliable configuration
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.update_interface(
                name,
                request.dict(exclude_none=True),
                iface_type=iface_type
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to update interface")

            return {"message": "Interface updated successfully", "name": name}
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
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error in update_interface: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update interface: {str(e)}"
        )


@router.delete("/interfaces/{name}")
async def delete_interface(name: str):
    """Delete a network interface"""
    try:
        # First, get interface type from reading
        read_service = _get_network_service()
        interfaces = read_service.get_interfaces()
        iface = next((i for i in interfaces if i.name == name), None)
        iface_type = iface.type if iface else "ethernet"

        # Use VyOSConfigService for reliable configuration
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.delete_interface_config(name, iface_type=iface_type)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete interface")

            return {"message": "Interface deleted successfully", "name": name}
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
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error in delete_interface: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete interface: {str(e)}"
        )


# IP Address Endpoints

@router.post("/interfaces/{interface}/ip-addresses")
async def add_ip_address(interface: str, request: IPAddressRequest):
    """Add an IP address to an interface"""
    try:
        # First, get interface type from reading
        read_service = _get_network_service()
        interfaces = read_service.get_interfaces()
        iface = next((i for i in interfaces if i.name == interface), None)
        iface_type = iface.type if iface else "ethernet"

        # Use VyOSConfigService for reliable configuration
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.add_ip_address_to_interface(
                interface,
                request.address,
                iface_type=iface_type
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to add IP address")

            return {"message": "IP address added successfully", "interface": interface, "address": request.address}
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
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error in add_ip_address: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add IP address: {str(e)}"
        )


@router.delete("/interfaces/{interface}/ip-addresses/{address:path}")
async def remove_ip_address(interface: str, address: str):
    """Remove an IP address from an interface"""
    try:
        # First, get interface type from reading
        read_service = _get_network_service()
        interfaces = read_service.get_interfaces()
        iface = next((i for i in interfaces if i.name == interface), None)
        iface_type = iface.type if iface else "ethernet"

        # Use VyOSConfigService for reliable configuration
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.remove_ip_address_from_interface(
                interface,
                address,
                iface_type=iface_type
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to remove IP address")

            return {"message": "IP address removed successfully", "interface": interface, "address": address}
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
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error in remove_ip_address: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to remove IP address: {str(e)}"
        )


@router.get("/ip-addresses", response_model=list[IPAddressResponse])
async def list_ip_addresses(interface: str | None = None):
    """List IP addresses, optionally filtered by interface"""
    try:
        service = _get_network_service()
        addresses = service.get_ip_addresses(interface)

        return [
            IPAddressResponse(
                address=addr.address,
                gateway=addr.gateway,
                vrf=addr.vrf,
            )
            for addr in addresses
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
        logger.error(f"Error in list_ip_addresses: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve IP addresses: {str(e)}"
        )


# Routing Endpoints

@router.get("/routes", response_model=list[RouteResponse])
async def list_routes():
    """List routing table"""
    try:
        service = _get_network_service()
        routes = service.get_routes()

        return [
            RouteResponse(
                destination=route.destination,
                next_hop=route.next_hop,
                interface=route.interface,
                distance=route.distance,
                metric=route.metric,
                route_type=route.route_type,
            )
            for route in routes
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
        logger.error(f"Error in list_routes: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve routes: {str(e)}"
        )


@router.post("/routes")
async def add_route(request: RouteRequest):
    """Add a static route"""
    try:
        # Use VyOSConfigService for reliable configuration
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.add_static_route(
                request.destination,
                next_hop=request.next_hop,
                interface=request.interface,
                distance=request.distance
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to add route")

            return {"message": "Route added successfully", "destination": request.destination}
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
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Error in add_route: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add route: {str(e)}"
        )


@router.delete("/routes/{destination:path}")
async def delete_route(destination: str, next_hop: str | None = None):
    """Delete a route"""
    try:
        # Use VyOSConfigService for reliable configuration
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.remove_static_route(destination)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete route")

            return {"message": "Route deleted successfully", "destination": destination}
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
        logger.error(f"Error in delete_route: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete route: {str(e)}"
        )


# ARP/NDP Endpoints

@router.get("/arp-table", response_model=list[ARPEntryResponse])
async def list_arp_table():
    """List ARP table"""
    try:
        service = _get_network_service()
        entries = service.get_arp_table()

        return [
            ARPEntryResponse(
                ip_address=entry.ip_address,
                mac_address=entry.mac_address,
                interface=entry.interface,
                age=entry.age,
                state=entry.state,
            )
            for entry in entries
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
        logger.error(f"Error in list_arp_table: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve ARP table: {str(e)}"
        )


@router.delete("/arp-table")
async def clear_arp_table(interface: str | None = None):
    """Clear ARP table"""
    try:
        service = _get_network_service()
        success = service.clear_arp_table(interface)

        if not success:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to clear ARP table")

        return {"message": "ARP table cleared successfully"}
    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in clear_arp_table: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear ARP table: {str(e)}"
        )


# DNS Endpoints

@router.get("/dns", response_model=DNSConfigResponse)
async def get_dns_config():
    """Get DNS configuration"""
    try:
        service = _get_network_service()
        config = service.get_dns_config()

        return DNSConfigResponse(
            domain_name=config.domain_name,
            name_servers=[
                DNSServerResponse(
                    server=server.server,
                    vrf=server.vrf,
                    priority=server.priority,
                )
                for server in config.name_servers or []
            ],
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
        logger.error(f"Error in get_dns_config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve DNS config: {str(e)}"
        )


@router.put("/dns/servers")
async def set_dns_servers(request: DNSSetRequest):
    """Set DNS servers"""
    try:
        # Use the new config service
        config = VyOSSSHConfig(
            host=settings.vyos_host,
            port=settings.vyos_port,
            username=settings.vyos_username,
            password=settings.vyos_password,
            timeout=settings.vyos_timeout,
        )
        ssh_client = VyOSSSHClient(config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.set_dns_servers(request.servers)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to set DNS servers")

            return {"message": "DNS servers set successfully", "servers": request.servers}
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
        logger.error(f"Error in set_dns_servers: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to set DNS servers: {str(e)}"
        )


@router.put("/dns/domain-name")
async def set_domain_name(request: DomainNameRequest):
    """Set system domain name"""
    try:
        # Use VyOSConfigService for reliable configuration
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.set_domain_name(request.domain)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to set domain name")

            return {"message": "Domain name set successfully"}
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
        logger.error(f"Error in set_domain_name: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to set domain name: {str(e)}"
        )


@router.post("/dns/mapping")
async def add_dns_mapping(request: DnsMappingRequest):
    """Add DNS hostname mapping"""
    try:
        service = _get_network_service()
        success = service.add_dns_mapping(request.hostname, request.ip_address)

        if not success:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to add DNS mapping")

        return {"message": "DNS mapping added successfully"}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/routes/summary", response_model=list[RouteSummaryResponse])
async def get_routes_summary():
    """Get detailed routing table summary with source and status information"""
    try:
        result = _get_executor().execute("/opt/vyatta/bin/vyatta-op-cmd-wrapper show ip route")

        if result.status.value != "success":
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Failed to get routing table from VyOS"
            )

        # Parse the output
        routes = []
        lines = result.stdout.strip().split('\n')

        # Route type mapping
        route_type_map = {
            'K': 'kernel',
            'C': 'connected',
            'S': 'static',
            'R': 'rip',
            'O': 'ospf',
            'I': 'isis',
            'B': 'bgp',
            'E': 'eigrp',
            'N': 'nhrp',
            'T': 'table',
            'A': 'babel',
            'F': 'pbr',
            'f': 'openfabric',
        }

        route_source_map = {
            'K': 'Kernel route',
            'C': 'Connected network',
            'S': 'Static route',
            'R': 'RIP route',
            'O': 'OSPF route',
            'I': 'IS-IS route',
            'B': 'BGP route',
            'E': 'EIGRP route',
            'N': 'NHRP route',
            'T': 'Table route',
            'A': 'Babel route',
            'F': 'Policy-based route',
            'f': 'OpenFabric route',
        }

        for line in lines:
            line = line.strip()
            if not line:
                continue
            if line.startswith('Codes:'):
                continue

            # Check for route line markers
            has_route_marker = False
            for marker in ['>', '*', 'q', 'r', 'b', 't', 'o']:
                if marker in line[:10]:
                    has_route_marker = True
                    break

            if not has_route_marker:
                continue

            parts = line.split()

            destination = None
            next_hop = None
            interface = None
            route_type = 'unknown'
            route_source = 'Unknown'
            is_selected = False
            is_fib = False
            is_queued = False
            is_rejected = False
            is_backup = False
            is_trapped = False
            is_offload_failure = False
            age = None

            for i, part in enumerate(parts):
                # Check for route type and status markers
                if len(part) <= 3 and any(c in part for c in ['K', 'C', 'S', 'R', 'O', 'I', 'B', 'E', 'N', 'T', 'A', 'F', 'f']):
                    # Extract route type character
                    type_char = None
                    for c in part:
                        if c in route_type_map:
                            type_char = c
                            break

                    if type_char:
                        route_type = route_type_map.get(type_char, 'unknown')
                        route_source = route_source_map.get(type_char, 'Unknown')

                    # Extract status markers
                    is_selected = '>' in part
                    is_fib = '*' in part
                    is_queued = 'q' in part
                    is_rejected = 'r' in part
                    is_backup = 'b' in part
                    is_trapped = 't' in part
                    is_offload_failure = 'o' in part

                elif '/' in part and not part.startswith('['):
                    destination = part
                elif part == 'via' and i + 1 < len(parts):
                    next_hop = parts[i + 1].rstrip(',')
                elif part.startswith('eth') or part.startswith('lo') or part.startswith('br') or part.startswith('bond'):
                    interface = part.rstrip(',')
                elif any(unit in part for unit in ['h', 'm', 's', 'd', 'w']):
                    # Check if it looks like an age (e.g., 2d03h45m)
                    if any(c.isdigit() for c in part):
                        age = part.rstrip(',')

            if destination:
                # Determine status
                status = 'inactive'
                if is_selected and is_fib:
                    status = 'active'
                elif is_selected:
                    status = 'selected'
                elif is_backup:
                    status = 'backup'
                elif is_rejected:
                    status = 'rejected'

                routes.append(RouteSummaryResponse(
                    destination=destination,
                    next_hop=next_hop,
                    interface=interface,
                    route_type=route_type,
                    route_source=route_source,
                    is_selected=is_selected,
                    is_fib=is_fib,
                    is_queued=is_queued,
                    is_rejected=is_rejected,
                    is_backup=is_backup,
                    is_trapped=is_trapped,
                    is_offload_failure=is_offload_failure,
                    age=age,
                    distance=1,
                    metric=0,
                    status=status,
                ))

        return routes

    except HTTPException:
        raise
    except ConnectionError as e:
        logger.error(f"VyOS connection failed: {e}")
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Failed to connect to VyOS device: {str(e)}"
        )
    except Exception as e:
        logger.error(f"Error in get_routes_summary: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve routes summary: {str(e)}"
        )

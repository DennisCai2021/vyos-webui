"""VPN configuration API endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from typing import Any, List, Optional

from app.services.vyos_ssh import VyOSSSHClient, VyOSSSHConfig
from app.services.vyos_config_service import VyOSConfigService
from app.core.config import settings

router = APIRouter(prefix="/vpn", tags=["vpn"])


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


# Request/Response Models

class WireGuardInterfaceCreate(BaseModel):
    """WireGuard interface create request"""
    name: str
    private_key: str
    address: str | None = None
    listen_port: int | None = None
    mtu: int | None = None
    description: str | None = None


class WireGuardInterfaceUpdate(BaseModel):
    """WireGuard interface update request"""
    address: str | None = None
    private_key: str | None = None
    listen_port: int | None = None
    mtu: int | None = None
    description: str | None = None


class WireGuardPeerAdd(BaseModel):
    """WireGuard peer add request"""
    name: str
    public_key: str
    allowed_ips: str | None = None
    endpoint: str | None = None
    endpoint_port: int | None = None
    persistent_keepalive: int | None = None


class WireGuardPeerResponse(BaseModel):
    """WireGuard peer response"""
    name: str
    public_key: str
    endpoint: str | None = None
    allowed_ips: str | None = None
    persistent_keepalive: int | None = 25
    enabled: bool = True


class WireGuardInterfaceResponse(BaseModel):
    """WireGuard interface response"""
    name: str
    address: str | None = None
    private_key: str | None = None
    public_key: str | None = None
    listen_port: int | None = None
    mtu: int = 1420
    description: str | None = None
    peers: list[WireGuardPeerResponse] = []


class WireGuardConfigResponse(BaseModel):
    """WireGuard config response"""
    interfaces: list[WireGuardInterfaceResponse]


class WireGuardStatusResponse(BaseModel):
    """WireGuard status response"""
    interfaces: list[dict]


# === IPsec Models ===
class IPsecPeerCreate(BaseModel):
    """IPsec peer create request"""
    name: str
    remote_address: str
    local_address: str | None = None
    pre_shared_key: str | None = None
    description: str | None = None
    ike_group: int = 14
    esp_group: int = 14


class IPsecPeerResponse(BaseModel):
    """IPsec peer response"""
    name: str
    remote_address: str | None = None
    local_address: str | None = None
    description: str | None = None
    ike_group: int | None = None
    esp_group: int | None = None
    tunnels: list[dict] = []


class IPsecTunnelAdd(BaseModel):
    """IPsec tunnel add request"""
    tunnel_name: str
    local_prefix: str
    remote_prefix: str


class IPsecConfigResponse(BaseModel):
    """IPsec config response"""
    peers: list[IPsecPeerResponse]


class IPsecStatusResponse(BaseModel):
    """IPsec status response"""
    peers: list[dict]
    sas: list[dict]


# === OpenVPN Models ===
class OpenVPNCreate(BaseModel):
    """OpenVPN create request"""
    name: str
    mode: str = "server"
    protocol: str = "udp"
    port: int = 1194
    device: str = "tun0"
    description: str | None = None


class OpenVPNResponse(BaseModel):
    """OpenVPN response"""
    name: str
    mode: str | None = None
    protocol: str | None = None
    port: int | None = None
    device: str | None = None
    description: str | None = None


class OpenVPNConfigResponse(BaseModel):
    """OpenVPN config response"""
    instances: list[OpenVPNResponse]


class TunnelStatusResponse(BaseModel):
    """VPN tunnel status response"""
    name: str
    type: str
    status: str
    uptime: int = 0
    bytes_in: int = 0
    bytes_out: int = 0
    error: str | None = None


# === WireGuard Endpoints ===

@router.get("/wireguard/config", response_model=WireGuardConfigResponse)
async def get_wireguard_config():
    """Get WireGuard configuration"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            config = config_service.get_wireguard_config()

            interfaces = []
            for iface in config.get('interfaces', []):
                peers = []
                for peer in iface.get('peers', []):
                    peers.append(WireGuardPeerResponse(
                        name=peer.get('name', ''),
                        public_key=peer.get('public_key', ''),
                        endpoint=peer.get('endpoint'),
                        allowed_ips=peer.get('allowed_ips'),
                        persistent_keepalive=peer.get('persistent_keepalive') if peer.get('persistent_keepalive') is not None else 25,
                        enabled=True,
                    ))
                interfaces.append(WireGuardInterfaceResponse(
                    name=iface.get('name', ''),
                    address=iface.get('address'),
                    private_key=iface.get('private_key'),
                    public_key=iface.get('public_key'),
                    listen_port=iface.get('listen_port'),
                    mtu=iface.get('mtu', 1420),
                    description=iface.get('description'),
                    peers=peers,
                ))

            return WireGuardConfigResponse(interfaces=interfaces)
        finally:
            ssh_client.disconnect()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/wireguard/status", response_model=WireGuardStatusResponse)
async def get_wireguard_status():
    """Get WireGuard status"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            return config_service.get_wireguard_status()
        finally:
            ssh_client.disconnect()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/wireguard/interfaces", response_model=list[WireGuardInterfaceResponse])
async def list_wireguard_interfaces():
    """List WireGuard interfaces"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            config = config_service.get_wireguard_config()

            interfaces = []
            for iface in config.get('interfaces', []):
                peers = []
                for peer in iface.get('peers', []):
                    peers.append(WireGuardPeerResponse(
                        name=peer.get('name', ''),
                        public_key=peer.get('public_key', ''),
                        endpoint=peer.get('endpoint'),
                        allowed_ips=peer.get('allowed_ips'),
                        persistent_keepalive=peer.get('persistent_keepalive') if peer.get('persistent_keepalive') is not None else 25,
                        enabled=True,
                    ))
                interfaces.append(WireGuardInterfaceResponse(
                    name=iface.get('name', ''),
                    address=iface.get('address'),
                    private_key=iface.get('private_key'),
                    public_key=iface.get('public_key'),
                    listen_port=iface.get('listen_port'),
                    mtu=iface.get('mtu', 1420),
                    description=iface.get('description'),
                    peers=peers,
                ))

            return interfaces
        finally:
            ssh_client.disconnect()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/wireguard/interfaces")
async def create_wireguard_interface(request: WireGuardInterfaceCreate):
    """Create a WireGuard interface"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.create_wireguard_interface(
                name=request.name,
                private_key=request.private_key,
                address=request.address,
                listen_port=request.listen_port,
                mtu=request.mtu,
                description=request.description,
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create WireGuard interface")

            return {"message": "WireGuard interface created successfully", "name": request.name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.put("/wireguard/interfaces/{name}")
async def update_wireguard_interface(name: str, request: WireGuardInterfaceUpdate):
    """Update a WireGuard interface"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            kwargs = {}
            if request.address is not None:
                kwargs['address'] = request.address
            if request.private_key is not None:
                kwargs['private_key'] = request.private_key
            if request.listen_port is not None:
                kwargs['listen_port'] = request.listen_port
            if request.mtu is not None:
                kwargs['mtu'] = request.mtu
            if request.description is not None:
                kwargs['description'] = request.description

            success = config_service.update_wireguard_interface(name, **kwargs)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to update WireGuard interface")

            return {"message": "WireGuard interface updated successfully", "name": name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/wireguard/interfaces/{name}")
async def delete_wireguard_interface(name: str):
    """Delete a WireGuard interface"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.delete_wireguard_interface(name)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete WireGuard interface")

            return {"message": "WireGuard interface deleted successfully", "name": name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/wireguard/interfaces/{name}/peers")
async def add_wireguard_peer(name: str, request: WireGuardPeerAdd):
    """Add a peer to WireGuard interface"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.add_wireguard_peer(
                interface=name,
                peer_name=request.name,
                public_key=request.public_key,
                allowed_ips=request.allowed_ips,
                endpoint=request.endpoint,
                endpoint_port=request.endpoint_port,
                persistent_keepalive=request.persistent_keepalive,
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to add WireGuard peer")

            return {"message": "WireGuard peer added successfully", "name": request.name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/wireguard/interfaces/{name}/peers/{peer_name}")
async def remove_wireguard_peer(name: str, peer_name: str):
    """Remove a peer from WireGuard interface"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.remove_wireguard_peer(name, peer_name)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to remove WireGuard peer")

            return {"message": "WireGuard peer removed successfully", "name": peer_name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# === IPsec Endpoints ===

@router.get("/ipsec/config", response_model=IPsecConfigResponse)
async def get_ipsec_config():
    """Get IPsec configuration"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            config = config_service.get_ipsec_config()

            peers = []
            for peer in config.get('peers', []):
                peers.append(IPsecPeerResponse(
                    name=peer.get('name', ''),
                    remote_address=peer.get('remote_address'),
                    local_address=peer.get('local_address'),
                    description=peer.get('description'),
                    ike_group=peer.get('ike_group'),
                    esp_group=peer.get('esp_group'),
                    tunnels=peer.get('tunnels', []),
                ))

            return IPsecConfigResponse(peers=peers)
        finally:
            ssh_client.disconnect()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/ipsec/status", response_model=IPsecStatusResponse)
async def get_ipsec_status():
    """Get IPsec status"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            return config_service.get_ipsec_status()
        finally:
            ssh_client.disconnect()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/ipsec/peers")
async def create_ipsec_peer(request: IPsecPeerCreate):
    """Create an IPsec peer"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.create_ipsec_peer(
                name=request.name,
                remote_address=request.remote_address,
                local_address=request.local_address,
                pre_shared_key=request.pre_shared_key,
                description=request.description,
                ike_group=request.ike_group,
                esp_group=request.esp_group,
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create IPsec peer")

            return {"message": "IPsec peer created successfully", "name": request.name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/ipsec/peers/{name}")
async def delete_ipsec_peer(name: str):
    """Delete an IPsec peer"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.delete_ipsec_peer(name)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete IPsec peer")

            return {"message": "IPsec peer deleted successfully", "name": name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/ipsec/peers/{name}/tunnels")
async def add_ipsec_tunnel(name: str, request: IPsecTunnelAdd):
    """Add a tunnel to an IPsec peer"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.add_ipsec_tunnel(
                peer_name=name,
                tunnel_name=request.tunnel_name,
                local_prefix=request.local_prefix,
                remote_prefix=request.remote_prefix,
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to add IPsec tunnel")

            return {"message": "IPsec tunnel added successfully", "tunnel_name": request.tunnel_name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# === OpenVPN Endpoints ===

@router.get("/openvpn/config", response_model=OpenVPNConfigResponse)
async def get_openvpn_config():
    """Get OpenVPN configuration"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            config = config_service.get_openvpn_config()

            instances = []
            for inst in config.get('instances', []):
                instances.append(OpenVPNResponse(
                    name=inst.get('name', ''),
                    mode=inst.get('mode'),
                    protocol=inst.get('protocol'),
                    port=inst.get('port'),
                    device=inst.get('device'),
                    description=inst.get('description'),
                ))

            return OpenVPNConfigResponse(instances=instances)
        finally:
            ssh_client.disconnect()
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/openvpn/instances")
async def create_openvpn_instance(request: OpenVPNCreate):
    """Create an OpenVPN instance"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.create_openvpn_instance(
                name=request.name,
                mode=request.mode,
                protocol=request.protocol,
                port=request.port,
                device=request.device,
                description=request.description,
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create OpenVPN instance")

            return {"message": "OpenVPN instance created successfully", "name": request.name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/openvpn/instances/{name}")
async def delete_openvpn_instance(name: str):
    """Delete an OpenVPN instance"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.delete_openvpn_instance(name)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete OpenVPN instance")

            return {"message": "OpenVPN instance deleted successfully", "name": name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# === Tunnel Status Endpoints ===

@router.get("/tunnels/status", response_model=list[TunnelStatusResponse])
async def get_all_tunnel_status():
    """Get status of all VPN tunnels"""
    # Return empty for now - will implement later
    return []

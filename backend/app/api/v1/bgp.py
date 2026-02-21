"""BGP API - Enhanced with all features!"""
import logging
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from typing import List, Optional, Any

from app.services.vyos_ssh import VyOSSSHClient, VyOSSSHConfig
from app.services.vyos_config_service import VyOSConfigService
from app.core.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/bgp", tags=["bgp"])


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

class BGPConfigRequest(BaseModel):
    local_as: int
    router_id: Optional[str] = None
    keepalive: Optional[int] = None
    holdtime: Optional[int] = None


class BGPConfigResponse(BaseModel):
    local_as: Optional[int] = None
    router_id: Optional[str] = None
    keepalive: Optional[int] = None
    holdtime: Optional[int] = None
    neighbors: List[dict] = []
    networks: List[str] = []


class BGPNeighborRequest(BaseModel):
    ip_address: str
    remote_as: int
    description: Optional[str] = None
    update_source: Optional[str] = None
    next_hop_self: bool = False
    password: Optional[str] = None
    advertisement_interval: Optional[int] = None
    ebgp_multihop: Optional[int] = None
    prefix_list_in: Optional[str] = None
    prefix_list_out: Optional[str] = None
    route_map_in: Optional[str] = None
    route_map_out: Optional[str] = None


class BGPNeighborUpdateRequest(BaseModel):
    description: Optional[str] = None
    update_source: Optional[str] = None
    next_hop_self: Optional[bool] = None
    password: Optional[str] = None
    advertisement_interval: Optional[int] = None
    ebgp_multihop: Optional[int] = None
    prefix_list_in: Optional[str] = None
    prefix_list_out: Optional[str] = None
    route_map_in: Optional[str] = None
    route_map_out: Optional[str] = None


class BGPNetworkRequest(BaseModel):
    network: str


# Prefix List Models
class PrefixListRuleRequest(BaseModel):
    sequence: int
    action: str
    prefix: str
    ge: Optional[int] = None
    le: Optional[int] = None


# Community List Models
class CommunityListRuleRequest(BaseModel):
    sequence: int
    action: str
    community: str
    description: Optional[str] = None


# Route Map Models
class RouteMapMatchRequest(BaseModel):
    ip_address_prefix_list: Optional[str] = None
    community: Optional[str] = None
    as_path: Optional[str] = None
    local_preference: Optional[int] = None
    metric: Optional[int] = None


class RouteMapSetRequest(BaseModel):
    local_preference: Optional[int] = None
    metric: Optional[int] = None
    weight: Optional[int] = None
    as_path_prepend: Optional[List[str]] = None
    community: Optional[List[str]] = None
    next_hop: Optional[str] = None


class RouteMapRuleRequest(BaseModel):
    sequence: int
    action: str
    description: Optional[str] = None
    match: Optional[RouteMapMatchRequest] = None
    set: Optional[RouteMapSetRequest] = None


# BGP Endpoints

@router.get("/config", response_model=BGPConfigResponse)
async def get_bgp_config():
    """Get BGP configuration"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            config = config_service.get_bgp_config()

            return BGPConfigResponse(
                local_as=config.get('local_as'),
                router_id=config.get('router_id'),
                keepalive=config.get('keepalive'),
                holdtime=config.get('holdtime'),
                neighbors=config.get('neighbors', []),
                networks=config.get('networks', [])
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
        logger.error(f"Error in get_bgp_config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to retrieve BGP config: {str(e)}"
        )


@router.put("/config")
async def update_bgp_config(request: BGPConfigRequest):
    """Update BGP global configuration with timers"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.set_bgp_global(
                request.local_as,
                router_id=request.router_id,
                keepalive=request.keepalive,
                holdtime=request.holdtime
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to update BGP config")

            return {
                "message": "BGP config updated successfully",
                "local_as": request.local_as,
                "router_id": request.router_id,
                "keepalive": request.keepalive,
                "holdtime": request.holdtime
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
        logger.error(f"Error in update_bgp_config: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update BGP config: {str(e)}"
        )


@router.post("/neighbors")
async def create_bgp_neighbor(request: BGPNeighborRequest):
    """Create BGP neighbor with all options"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            config = config_service.get_bgp_config()
            local_as = config.get('local_as')

            if not local_as:
                raise HTTPException(status_code=400, detail="BGP AS not configured. Please configure BGP first.")

            # Check if it's iBGP and automatically handle next-hop-self suggestion
            is_ibgp = (local_as == request.remote_as)

            success = config_service.add_bgp_neighbor(
                local_as,
                request.ip_address,
                request.remote_as,
                description=request.description,
                update_source=request.update_source,
                next_hop_self=request.next_hop_self if request.next_hop_self is not None else is_ibgp,
                password=request.password,
                advertisement_interval=request.advertisement_interval,
                ebgp_multihop=request.ebgp_multihop,
                prefix_list_in=request.prefix_list_in,
                prefix_list_out=request.prefix_list_out,
                route_map_in=request.route_map_in,
                route_map_out=request.route_map_out
            )

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to create BGP neighbor")

            return {
                "message": "BGP neighbor created successfully",
                "ip_address": request.ip_address,
                "is_ibgp": is_ibgp
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
        logger.error(f"Error in create_bgp_neighbor: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create BGP neighbor: {str(e)}"
        )


@router.put("/neighbors/{ip_address}")
async def update_bgp_neighbor(ip_address: str, request: BGPNeighborUpdateRequest):
    """Update BGP neighbor"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)

            # Build update kwargs
            update_kwargs = {}
            if request.description is not None:
                update_kwargs['description'] = request.description
            if request.update_source is not None:
                update_kwargs['update_source'] = request.update_source
            if request.next_hop_self is not None:
                update_kwargs['next_hop_self'] = request.next_hop_self
            if request.password is not None:
                update_kwargs['password'] = request.password
            if request.advertisement_interval is not None:
                update_kwargs['advertisement_interval'] = request.advertisement_interval
            if request.ebgp_multihop is not None:
                update_kwargs['ebgp_multihop'] = request.ebgp_multihop
            if request.prefix_list_in is not None:
                update_kwargs['prefix_list_in'] = request.prefix_list_in
            if request.prefix_list_out is not None:
                update_kwargs['prefix_list_out'] = request.prefix_list_out
            if request.route_map_in is not None:
                update_kwargs['route_map_in'] = request.route_map_in
            if request.route_map_out is not None:
                update_kwargs['route_map_out'] = request.route_map_out

            success = config_service.update_bgp_neighbor(ip_address, **update_kwargs)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to update BGP neighbor")

            return {"message": "BGP neighbor updated successfully", "ip_address": ip_address}
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
        logger.error(f"Error in update_bgp_neighbor: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update BGP neighbor: {str(e)}"
        )


@router.delete("/neighbors/{ip_address}")
async def delete_bgp_neighbor(ip_address: str):
    """Delete BGP neighbor"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            config = config_service.get_bgp_config()
            local_as = config.get('local_as')

            if not local_as:
                raise HTTPException(status_code=400, detail="BGP AS not configured")

            success = config_service.delete_bgp_neighbor(local_as, ip_address)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete BGP neighbor")

            return {"message": "BGP neighbor deleted successfully", "ip_address": ip_address}
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
        logger.error(f"Error in delete_bgp_neighbor: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete BGP neighbor: {str(e)}"
        )


@router.post("/networks")
async def add_bgp_network(request: BGPNetworkRequest):
    """Add network to BGP"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            config = config_service.get_bgp_config()
            local_as = config.get('local_as')

            if not local_as:
                raise HTTPException(status_code=400, detail="BGP AS not configured")

            success = config_service.add_bgp_network(local_as, request.network)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to add BGP network")

            return {"message": "BGP network added successfully", "network": request.network}
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
        logger.error(f"Error in add_bgp_network: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add BGP network: {str(e)}"
        )


@router.delete("/networks/{network:path}")
async def delete_bgp_network(network: str):
    """Delete network from BGP"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            config = config_service.get_bgp_config()
            local_as = config.get('local_as')

            if not local_as:
                raise HTTPException(status_code=400, detail="BGP AS not configured")

            success = config_service.delete_bgp_network(local_as, network)

            if not success:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed to delete BGP network")

            return {"message": "BGP network deleted successfully", "network": network}
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
        logger.error(f"Error in delete_bgp_network: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete BGP network: {str(e)}"
        )


# === Prefix List Endpoints ===

@router.get("/prefix-lists")
async def get_prefix_lists():
    """Get all prefix-lists"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            return {"prefix_lists": config_service.get_prefix_lists()}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_prefix_lists: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get prefix-lists: {str(e)}"
        )


@router.post("/prefix-lists")
async def create_prefix_list(name: str):
    """Create a prefix-list"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.create_prefix_list(name)
            if not success:
                raise HTTPException(status_code=400, detail="Failed to create prefix-list")
            return {"message": "Prefix-list created", "name": name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in create_prefix_list: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create prefix-list: {str(e)}"
        )


@router.delete("/prefix-lists/{name}")
async def delete_prefix_list(name: str):
    """Delete a prefix-list"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.delete_prefix_list(name)
            if not success:
                raise HTTPException(status_code=400, detail="Failed to delete prefix-list")
            return {"message": "Prefix-list deleted", "name": name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in delete_prefix_list: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete prefix-list: {str(e)}"
        )


@router.post("/prefix-lists/{name}/rules")
async def add_prefix_list_rule(name: str, request: PrefixListRuleRequest):
    """Add a rule to a prefix-list"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.add_prefix_list_rule(
                name, request.sequence, request.action, request.prefix,
                ge=request.ge, le=request.le
            )
            if not success:
                raise HTTPException(status_code=400, detail="Failed to add prefix-list rule")
            return {"message": "Prefix-list rule added", "name": name, "sequence": request.sequence}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in add_prefix_list_rule: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add prefix-list rule: {str(e)}"
        )


@router.delete("/prefix-lists/{name}/rules/{sequence}")
async def delete_prefix_list_rule(name: str, sequence: int):
    """Delete a rule from a prefix-list"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.delete_prefix_list_rule(name, sequence)
            if not success:
                raise HTTPException(status_code=400, detail="Failed to delete prefix-list rule")
            return {"message": "Prefix-list rule deleted", "name": name, "sequence": sequence}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in delete_prefix_list_rule: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete prefix-list rule: {str(e)}"
        )


# === Community List Endpoints ===

@router.get("/community-lists")
async def get_community_lists():
    """Get all community-lists"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            return {"community_lists": config_service.get_community_lists()}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_community_lists: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get community-lists: {str(e)}"
        )


@router.get("/summary")
async def get_bgp_summary():
    """Get BGP summary (show ip bgp summary)"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            summary = config_service.get_bgp_summary()
            return summary
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_bgp_summary: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get BGP summary: {str(e)}"
        )


@router.post("/community-lists")
async def create_community_list(name: str, type: str = "standard"):
    """Create a community-list"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.create_community_list(name, list_type=type)
            if not success:
                raise HTTPException(status_code=400, detail="Failed to create community-list")
            return {"message": "Community-list created", "name": name, "type": type}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in create_community_list: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create community-list: {str(e)}"
        )


@router.delete("/community-lists/{name}")
async def delete_community_list(name: str):
    """Delete a community-list"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.delete_community_list(name)
            if not success:
                raise HTTPException(status_code=400, detail="Failed to delete community-list")
            return {"message": "Community-list deleted", "name": name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in delete_community_list: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete community-list: {str(e)}"
        )


@router.post("/community-lists/{name}/rules")
async def add_community_list_rule(name: str, request: CommunityListRuleRequest):
    """Add a rule to a community-list"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.add_community_list_rule(
                name, request.sequence, request.action, request.community,
                description=request.description
            )
            if not success:
                raise HTTPException(status_code=400, detail="Failed to add community-list rule")
            return {"message": "Community-list rule added", "name": name, "sequence": request.sequence}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in add_community_list_rule: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add community-list rule: {str(e)}"
        )


@router.delete("/community-lists/{name}/rules/{sequence}")
async def delete_community_list_rule(name: str, sequence: int):
    """Delete a rule from a community-list"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.delete_community_list_rule(name, sequence)
            if not success:
                raise HTTPException(status_code=400, detail="Failed to delete community-list rule")
            return {"message": "Community-list rule deleted", "name": name, "sequence": sequence}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in delete_community_list_rule: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete community-list rule: {str(e)}"
        )


# === Route Map Endpoints ===

@router.get("/route-maps")
async def get_route_maps():
    """Get all route-maps"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            return {"route_maps": config_service.get_route_maps()}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in get_route_maps: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get route-maps: {str(e)}"
        )


@router.post("/route-maps")
async def create_route_map(name: str):
    """Create a route-map"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.create_route_map(name)
            if not success:
                raise HTTPException(status_code=400, detail="Failed to create route-map")
            return {"message": "Route-map created", "name": name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in create_route_map: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create route-map: {str(e)}"
        )


@router.delete("/route-maps/{name}")
async def delete_route_map(name: str):
    """Delete a route-map"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.delete_route_map(name)
            if not success:
                raise HTTPException(status_code=400, detail="Failed to delete route-map")
            return {"message": "Route-map deleted", "name": name}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in delete_route_map: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete route-map: {str(e)}"
        )


@router.post("/route-maps/{name}/rules")
async def add_route_map_rule(name: str, request: RouteMapRuleRequest):
    """Add a rule to a route-map"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.add_route_map_rule(
                name, request.sequence, request.action,
                description=request.description,
                match=request.match.dict() if request.match else None,
                set=request.set.dict() if request.set else None
            )
            if not success:
                raise HTTPException(status_code=400, detail="Failed to add route-map rule")
            return {"message": "Route-map rule added", "name": name, "sequence": request.sequence}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in add_route_map_rule: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to add route-map rule: {str(e)}"
        )


@router.delete("/route-maps/{name}/rules/{sequence}")
async def delete_route_map_rule(name: str, sequence: int):
    """Delete a rule from a route-map"""
    try:
        ssh_config = _get_ssh_config()
        ssh_client = VyOSSSHClient(ssh_config)
        ssh_client.connect()

        try:
            config_service = VyOSConfigService(ssh_client)
            success = config_service.delete_route_map_rule(name, sequence)
            if not success:
                raise HTTPException(status_code=400, detail="Failed to delete route-map rule")
            return {"message": "Route-map rule deleted", "name": name, "sequence": sequence}
        finally:
            ssh_client.disconnect()
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in delete_route_map_rule: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete route-map rule: {str(e)}"
        )

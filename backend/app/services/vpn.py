"""VyOS VPN Configuration Service"""
import re
from dataclasses import dataclass, field
from typing import Any
from enum import Enum

from app.services.vyos_command import VyOSCommandExecutor


class VPNType(str, Enum):
    """VPN type"""

    IPSEC = "ipsec"
    OPENVPN = "openvpn"
    WIREGUARD = "wireguard"


class IPSecMode(str, Enum):
    """IPsec mode"""

    TUNNEL = "tunnel"
    TRANSPORT = "transport"


class IPSecProtocol(str, Enum):
    """IPsec protocol"""

    ESP = "esp"
    AH = "ah"


class IPsecAuthMethod(str, Enum):
    """IPsec authentication method"""

    PSK = "psk"
    RSA = "rsa"
    ECDSA = "ecdsa"


class OpenVPNMode(str, Enum):
    """OpenVPN mode"""

    SERVER = "server"
    CLIENT = "client"
    SITE_TO_SITE = "site-to-site"


class TunnelStatus(str, Enum):
    """VPN tunnel status"""

    UP = "up"
    DOWN = "down"
    CONNECTING = "connecting"
    DISCONNECTING = "disconnecting"
    ERROR = "error"


@dataclass
class IPsecPeer:
    """IPsec peer configuration"""

    name: str
    description: str | None = None
    address: str | None = None
    local_address: str | None = None
    auth_method: IPsecAuthMethod = IPsecAuthMethod.PSK
    psk: str | None = None
    certificate: str | None = None
    mode: IPSecMode = IPSecMode.TUNNEL
    protocol: IPSecProtocol = IPSecProtocol.ESP
    ike_group: int = 14
    esp_group: int = 14
    life_time: int = 3600
    dead_peer_detection: bool = True
    dpd_timeout: int = 30
    dpd_interval: int = 10


@dataclass
class IPsecTunnel:
    """IPsec tunnel configuration"""

    name: str
    local_subnet: str | None = None
    remote_subnet: str | None = None
    peer: str | None = None
    encryption: str = "aes256gcm16"
    integrity: str = "sha256"
    pfs_group: int = 14
    enable: bool = True


@dataclass
class OpenVPNInstance:
    """OpenVPN instance configuration"""

    name: str
    mode: OpenVPNMode = OpenVPNMode.SERVER
    description: str | None = None
    port: int = 1194
    protocol: str = "udp"
    device: str = "tap0"
    encryption: str = "aes256"
    tls_auth: bool = True
    tls_version_min: str = "1.2"
    keepalive: str = "10 120"
    persist_tun: bool = True
    persist_key: bool = True


@dataclass
class OpenVPNClient:
    """OpenVPN client configuration"""

    name: str
    certificate: str | None = None
    key: str | None = None
    subnet: str | None = None
    push_routes: list[str] = field(default_factory=list)
    enabled: bool = True


@dataclass
class WireGuardPeer:
    """WireGuard peer configuration"""

    name: str
    public_key: str
    endpoint: str | None = None
    allowed_ips: str | None = None
    persistent_keepalive: int = 25
    enabled: bool = True


@dataclass
class WireGuardInterface:
    """WireGuard interface configuration"""

    name: str
    private_key: str
    public_key: str
    listen_port: int | None = None
    mtu: int = 1420
    peers: list[WireGuardPeer] = field(default_factory=list)


@dataclass
class VPNTunnelStatus:
    """VPN tunnel status"""

    name: str
    type: VPNType
    status: TunnelStatus
    uptime: int = 0
    bytes_in: int = 0
    bytes_out: int = 0
    error: str | None = None


class VPNService:
    """Service for VyOS VPN configuration"""

    def __init__(self, executor: VyOSCommandExecutor):
        """Initialize service

        Args:
            executor: VyOS command executor
        """
        self.executor = executor

    # IPsec VPN Management

    def get_ipsec_peers(self) -> list[IPsecPeer]:
        """Get IPsec peers

        Returns:
            List of IPsecPeer objects
        """
        result = self.executor.execute_show("vpn ipsec site-to-site peer")
        return self._parse_ipsec_peers(result.stdout)

    def get_ipsec_peer(self, name: str) -> IPsecPeer | None:
        """Get specific IPsec peer

        Args:
            name: Peer name

        Returns:
            IPsecPeer object or None
        """
        peers = self.get_ipsec_peers()

        for peer in peers:
            if peer.name == name:
                return peer

        return None

    def create_ipsec_peer(self, peer: IPsecPeer) -> bool:
        """Create an IPsec peer

        Args:
            peer: IPsecPeer object

        Returns:
            True if successful
        """
        commands = self._build_ipsec_peer_commands(peer, create=True)
        result = self.executor.configure(commands)
        return result.exit_code == 0

    def update_ipsec_peer(self, name: str, updates: dict[str, Any]) -> bool:
        """Update an IPsec peer

        Args:
            name: Peer name
            updates: Peer updates

        Returns:
            True if successful
        """
        peer = self.get_ipsec_peer(name)
        if not peer:
            raise ValueError(f"IPsec peer {name} not found")

        delete_commands = self._build_ipsec_peer_commands(peer, create=False)

        for key, value in updates.items():
            if hasattr(peer, key):
                setattr(peer, key, value)

        create_commands = self._build_ipsec_peer_commands(peer, create=True)

        commands = delete_commands + create_commands
        result = self.executor.configure(commands)
        return result.exit_code == 0

    def delete_ipsec_peer(self, name: str) -> bool:
        """Delete an IPsec peer

        Args:
            name: Peer name

        Returns:
            True if successful
        """
        peer = self.get_ipsec_peer(name)
        if not peer:
            raise ValueError(f"IPsec peer {name} not found")

        commands = [f"delete vpn ipsec site-to-site peer {name}"]
        result = self.executor.configure(commands)
        return result.exit_code == 0

    def get_ipsec_tunnels(self) -> list[IPsecTunnel]:
        """Get IPsec tunnels

        Returns:
            List of IPsecTunnel objects
        """
        result = self.executor.execute_show("vpn ipsec site-to-site tunnel")
        return self._parse_ipsec_tunnels(result.stdout)

    def create_ipsec_tunnel(self, tunnel: IPsecTunnel) -> bool:
        """Create an IPsec tunnel

        Args:
            tunnel: IPsecTunnel object

        Returns:
            True if successful
        """
        commands = self._build_ipsec_tunnel_commands(tunnel, create=True)
        result = self.executor.configure(commands)
        return result.exit_code == 0

    def delete_ipsec_tunnel(self, name: str) -> bool:
        """Delete an IPsec tunnel

        Args:
            name: Tunnel name

        Returns:
            True if successful
        """
        commands = [f"delete vpn ipsec site-to-site tunnel {name}"]
        result = self.executor.configure(commands)
        return result.exit_code == 0

    # OpenVPN Management

    def get_openvpn_instances(self) -> list[OpenVPNInstance]:
        """Get OpenVPN instances

        Returns:
            List of OpenVPNInstance objects
        """
        result = self.executor.execute_show("interfaces openvpn")
        return self._parse_openvpn_instances(result.stdout)

    def get_openvpn_instance(self, name: str) -> OpenVPNInstance | None:
        """Get specific OpenVPN instance

        Args:
            name: Instance name

        Returns:
            OpenVPNInstance object or None
        """
        instances = self.get_openvpn_instances()

        for instance in instances:
            if instance.name == name:
                return instance

        return None

    def create_openvpn_instance(self, instance: OpenVPNInstance) -> bool:
        """Create an OpenVPN instance

        Args:
            instance: OpenVPNInstance object

        Returns:
            True if successful
        """
        commands = self._build_openvpn_instance_commands(instance, create=True)
        result = self.executor.configure(commands)
        return result.exit_code == 0

    def update_openvpn_instance(self, name: str, updates: dict[str, Any]) -> bool:
        """Update an OpenVPN instance

        Args:
            name: Instance name
            updates: Instance updates

        Returns:
            True if successful
        """
        instance = self.get_openvpn_instance(name)
        if not instance:
            raise ValueError(f"OpenVPN instance {name} not found")

        delete_commands = self._build_openvpn_instance_commands(instance, create=False)

        for key, value in updates.items():
            if hasattr(instance, key):
                setattr(instance, key, value)

        create_commands = self._build_openvpn_instance_commands(instance, create=True)

        commands = delete_commands + create_commands
        result = self.executor.configure(commands)
        return result.exit_code == 0

    def delete_openvpn_instance(self, name: str) -> bool:
        """Delete an OpenVPN instance

        Args:
            name: Instance name

        Returns:
            True if successful
        """
        commands = [f"delete interfaces openvpn {name}"]
        result = self.executor.configure(commands)
        return result.exit_code == 0

    def get_openvpn_clients(self, instance: str) -> list[OpenVPNClient]:
        """Get OpenVPN clients for an instance

        Args:
            instance: Instance name

        Returns:
            List of OpenVPNClient objects
        """
        result = self.executor.execute_show(f"interfaces openvpn {instance} client")
        return self._parse_openvpn_clients(result.stdout)

    # WireGuard Management

    def get_wireguard_interfaces(self) -> list[WireGuardInterface]:
        """Get WireGuard interfaces

        Returns:
            List of WireGuardInterface objects
        """
        result = self.executor.execute_show("interfaces wireguard")
        return self._parse_wireguard_interfaces(result.stdout)

    def get_wireguard_interface(self, name: str) -> WireGuardInterface | None:
        """Get specific WireGuard interface

        Args:
            name: Interface name

        Returns:
            WireGuardInterface object or None
        """
        interfaces = self.get_wireguard_interfaces()

        for interface in interfaces:
            if interface.name == name:
                return interface

        return None

    def create_wireguard_interface(self, interface: WireGuardInterface) -> bool:
        """Create a WireGuard interface

        Args:
            interface: WireGuardInterface object

        Returns:
            True if successful
        """
        commands = self._build_wireguard_interface_commands(interface, create=True)
        result = self.executor.configure(commands)
        return result.exit_code == 0

    def update_wireguard_interface(self, name: str, updates: dict[str, Any]) -> bool:
        """Update a WireGuard interface

        Args:
            name: Interface name
            updates: Interface updates

        Returns:
            True if successful
        """
        interface = self.get_wireguard_interface(name)
        if not interface:
            raise ValueError(f"WireGuard interface {name} not found")

        delete_commands = self._build_wireguard_interface_commands(interface, create=False)

        for key, value in updates.items():
            if hasattr(interface, key):
                setattr(interface, key, value)

        create_commands = self._build_wireguard_interface_commands(interface, create=True)

        commands = delete_commands + create_commands
        result = self.executor.configure(commands)
        return result.exit_code == 0

    def delete_wireguard_interface(self, name: str) -> bool:
        """Delete a WireGuard interface

        Args:
            name: Interface name

        Returns:
            True if successful
        """
        commands = [f"delete interfaces wireguard {name}"]
        result = self.executor.configure(commands)
        return result.exit_code == 0

    def add_wireguard_peer(self, interface_name: str, peer: WireGuardPeer) -> bool:
        """Add a peer to WireGuard interface

        Args:
            interface_name: Interface name
            peer: WireGuardPeer object

        Returns:
            True if successful
        """
        commands = [
            f"set interfaces wireguard {interface_name} peer {peer.name} public-key {peer.public_key}",
        ]

        if peer.endpoint:
            commands.append(f"set interfaces wireguard {interface_name} peer {peer.name} endpoint {peer.endpoint}")

        if peer.allowed_ips:
            commands.append(f"set interfaces wireguard {interface_name} peer {peer.name} allowed-ips {peer.allowed_ips}")

        commands.append(f"set interfaces wireguard {interface_name} peer {peer.name} persistent-keepalive {peer.persistent_keepalive}")

        result = self.executor.configure(commands)
        return result.exit_code == 0

    def remove_wireguard_peer(self, interface_name: str, peer_name: str) -> bool:
        """Remove a peer from WireGuard interface

        Args:
            interface_name: Interface name
            peer_name: Peer name

        Returns:
            True if successful
        """
        commands = [f"delete interfaces wireguard {interface_name} peer {peer_name}"]
        result = self.executor.configure(commands)
        return result.exit_code == 0

    # VPN Status Monitoring

    def get_tunnel_status(self, tunnel_name: str, vpn_type: VPNType) -> VPNTunnelStatus:
        """Get VPN tunnel status

        Args:
            tunnel_name: Tunnel name
            vpn_type: VPN type

        Returns:
            VPNTunnelStatus object
        """
        status = TunnelStatus.DOWN
        uptime = 0
        bytes_in = 0
        bytes_out = 0
        error = None

        try:
            if vpn_type == VPNType.IPSEC:
                result = self.executor.execute("sudo ipsec status")
                if tunnel_name in result.stdout and "INSTALLED, ESTABLISHED" in result.stdout:
                    status = TunnelStatus.UP

            elif vpn_type == VPNType.OPENVPN:
                result = self.executor.execute("sudo systemctl status openvpn@server")
                if "active (running)" in result.stdout:
                    status = TunnelStatus.UP

            elif vpn_type == VPNType.WIREGUARD:
                result = self.executor.execute(f"sudo wg show {tunnel_name}")
                if result.exit_code == 0:
                    status = TunnelStatus.UP

        except Exception as e:
            error = str(e)
            status = TunnelStatus.ERROR

        return VPNTunnelStatus(
            name=tunnel_name,
            type=vpn_type,
            status=status,
            uptime=uptime,
            bytes_in=bytes_in,
            bytes_out=bytes_out,
            error=error,
        )

    def get_all_tunnel_status(self) -> list[VPNTunnelStatus]:
        """Get status of all VPN tunnels

        Returns:
            List of VPNTunnelStatus objects
        """
        statuses = []

        # IPsec tunnels
        for tunnel in self.get_ipsec_tunnels():
            statuses.append(self.get_tunnel_status(tunnel.name, VPNType.IPSEC))

        # OpenVPN instances
        for instance in self.get_openvpn_instances():
            statuses.append(self.get_tunnel_status(instance.name, VPNType.OPENVPN))

        # WireGuard interfaces
        for interface in self.get_wireguard_interfaces():
            statuses.append(self.get_tunnel_status(interface.name, VPNType.WIREGUARD))

        return statuses

    # Tunnel Management

    def restart_tunnel(self, tunnel_name: str, vpn_type: VPNType) -> bool:
        """Restart a VPN tunnel

        Args:
            tunnel_name: Tunnel name
            vpn_type: VPN type

        Returns:
            True if successful
        """
        try:
            if vpn_type == VPNType.IPSEC:
                commands = [
                    f"delete vpn ipsec site-to-site tunnel {tunnel_name}",
                    f"set vpn ipsec site-to-site tunnel {tunnel_name}",
                ]
                result = self.executor.configure(commands)

            elif vpn_type == VPNType.OPENVPN:
                result = self.executor.execute(f"sudo systemctl restart openvpn@{tunnel_name}")

            elif vpn_type == VPNType.WIREGUARD:
                result = self.executor.execute(f"sudo wg-quick down {tunnel_name} && sudo wg-quick up {tunnel_name}")

            return result.exit_code == 0

        except Exception:
            return False

    def stop_tunnel(self, tunnel_name: str, vpn_type: VPNType) -> bool:
        """Stop a VPN tunnel

        Args:
            tunnel_name: Tunnel name
            vpn_type: VPN type

        Returns:
            True if successful
        """
        try:
            if vpn_type == VPNType.IPSEC:
                commands = [f"delete vpn ipsec site-to-site tunnel {tunnel_name} enable"]
                result = self.executor.configure(commands)

            elif vpn_type == VPNType.OPENVPN:
                result = self.executor.execute(f"sudo systemctl stop openvpn@{tunnel_name}")

            elif vpn_type == VPNType.WIREGUARD:
                result = self.executor.execute(f"sudo wg-quick down {tunnel_name}")

            return result.exit_code == 0

        except Exception:
            return False

    def start_tunnel(self, tunnel_name: str, vpn_type: VPNType) -> bool:
        """Start a VPN tunnel

        Args:
            tunnel_name: Tunnel name
            vpn_type: VPN type

        Returns:
            True if successful
        """
        try:
            if vpn_type == VPNType.IPSEC:
                commands = [f"set vpn ipsec site-to-site tunnel {tunnel_name} enable"]
                result = self.executor.configure(commands)

            elif vpn_type == VPNType.OPENVPN:
                result = self.executor.execute(f"sudo systemctl start openvpn@{tunnel_name}")

            elif vpn_type == VPNType.WIREGUARD:
                result = self.executor.execute(f"sudo wg-quick up {tunnel_name}")

            return result.exit_code == 0

        except Exception:
            return False

    # Parsing Helpers

    def _parse_ipsec_peers(self, output: str) -> list[IPsecPeer]:
        """Parse IPsec peers configuration"""
        peers = []
        current_peer = None

        for line in output.split("\n"):
            line = line.strip()

            if line.startswith("peer"):
                parts = line.split()
                if len(parts) >= 2:
                    peer_name = parts[1]

                    if current_peer:
                        peers.append(current_peer)

                    current_peer = IPsecPeer(name=peer_name)

            elif current_peer and "authentication" in line:
                if "pre-shared-secret" in line:
                    current_peer.auth_method = IPsecAuthMethod.PSK
                elif "rsa-signature" in line:
                    current_peer.auth_method = IPsecAuthMethod.RSA

            elif current_peer and "remote-address" in line:
                match = re.search(r'remote-address\s+(\S+)', line)
                if match:
                    current_peer.address = match.group(1)

        if current_peer:
            peers.append(current_peer)

        return peers

    def _parse_ipsec_tunnels(self, output: str) -> list[IPsecTunnel]:
        """Parse IPsec tunnels configuration"""
        tunnels = []
        current_tunnel = None

        for line in output.split("\n"):
            line = line.strip()

            if line.startswith("tunnel"):
                parts = line.split()
                if len(parts) >= 2:
                    tunnel_name = parts[1]

                    if current_tunnel:
                        tunnels.append(current_tunnel)

                    current_tunnel = IPsecTunnel(name=tunnel_name)

            elif current_tunnel and "local" in line and "subnet" in line:
                match = re.search(r'subnet\s+(\S+)', line)
                if match:
                    current_tunnel.local_subnet = match.group(1)

            elif current_tunnel and "remote" in line and "subnet" in line:
                match = re.search(r'subnet\s+(\S+)', line)
                if match:
                    current_tunnel.remote_subnet = match.group(1)

        if current_tunnel:
            tunnels.append(current_tunnel)

        return tunnels

    def _parse_openvpn_instances(self, output: str) -> list[OpenVPNInstance]:
        """Parse OpenVPN instances configuration"""
        instances = []
        current_instance = None

        for line in output.split("\n"):
            line = line.strip()

            if line and not line.startswith("mode") and not line.startswith("port") and \
               not line.startswith("protocol") and not line.startswith("device"):
                parts = line.split()
                if len(parts) >= 1:
                    instance_name = parts[0]

                    if current_instance:
                        instances.append(current_instance)

                    current_instance = OpenVPNInstance(name=instance_name)

        if current_instance:
            instances.append(current_instance)

        return instances

    def _parse_openvpn_clients(self, output: str) -> list[OpenVPNClient]:
        """Parse OpenVPN clients configuration"""
        clients = []
        current_client = None

        for line in output.split("\n"):
            line = line.strip()

            if line.startswith("client"):
                parts = line.split()
                if len(parts) >= 2:
                    client_name = parts[1]

                    if current_client:
                        clients.append(current_client)

                    current_client = OpenVPNClient(name=client_name)

        if current_client:
            clients.append(current_client)

        return clients

    def _parse_wireguard_interfaces(self, output: str) -> list[WireGuardInterface]:
        """Parse WireGuard interfaces configuration"""
        interfaces = []

        for line in output.split("\n"):
            line = line.strip()

            if line.startswith("wg"):
                interface_name = line

                # Get public key for the interface
                result = self.executor.execute(f"sudo wg show {interface_name} public-key")
                public_key = result.stdout.strip()

                interfaces.append(WireGuardInterface(
                    name=interface_name,
                    private_key="",
                    public_key=public_key,
                ))

        return interfaces

    # Command Building Helpers

    def _build_ipsec_peer_commands(self, peer: IPsecPeer, create: bool) -> list[str]:
        """Build IPsec peer configuration commands"""
        base = f"vpn ipsec site-to-site peer {peer.name}"

        if not create:
            return [f"delete {base}"]

        commands = []

        if peer.address:
            commands.append(f"set {base} authentication mode pre-shared-secret")
            commands.append(f"set {base} remote-address {peer.address}")

        if peer.local_address:
            commands.append(f"set {base} local-address {peer.local_address}")

        return commands

    def _build_ipsec_tunnel_commands(self, tunnel: IPsecTunnel, create: bool) -> list[str]:
        """Build IPsec tunnel configuration commands"""
        base = f"vpn ipsec site-to-site tunnel {tunnel.name}"

        if not create:
            return [f"delete {base}"]

        commands = []

        if tunnel.local_subnet:
            commands.append(f"set {base} local subnet {tunnel.local_subnet}")

        if tunnel.remote_subnet:
            commands.append(f"set {base} remote subnet {tunnel.remote_subnet}")

        return commands

    def _build_openvpn_instance_commands(self, instance: OpenVPNInstance, create: bool) -> list[str]:
        """Build OpenVPN instance configuration commands"""
        base = f"interfaces openvpn {instance.name}"

        if not create:
            return [f"delete {base}"]

        commands = [
            f"set {base} mode {instance.mode.value}",
            f"set {base} device-type tap",
            f"set {base} protocol {instance.protocol}",
            f"set {base} local-port {instance.port}",
        ]

        return commands

    def _build_wireguard_interface_commands(self, interface: WireGuardInterface, create: bool) -> list[str]:
        """Build WireGuard interface configuration commands"""
        base = f"interfaces wireguard {interface.name}"

        if not create:
            return [f"delete {base}"]

        commands = [
            f"set {base} address 10.0.0.1/24",
            f"set {base} private-key {interface.private_key}",
            f"set {base} listen-port {interface.listen_port or 51820}",
        ]

        return commands

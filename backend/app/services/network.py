"""VyOS Network Configuration Service - Updated with real parser"""
import re
from dataclasses import dataclass
from typing import Any

from app.services.vyos_command import VyOSCommandExecutor, CommandStatus


@dataclass
class NetworkInterface:
    """Network interface information"""
    name: str
    type: str  # 'ethernet', 'loopback', 'bridge', 'bonding', 'vlan', 'pppoe'
    description: str | None = None
    status: str = "down"  # 'up', 'down'
    mtu: int = 1500
    mac_address: str | None = None
    ip_addresses: list[dict] | None = None  # List of IP address dicts
    vrf: str | None = None
    speed: str | None = None
    duplex: str | None = None


@dataclass
class IPAddress:
    """IP address configuration"""
    address: str  # e.g., "192.168.1.1/24"
    gateway: str | None = None
    vrf: str | None = None


@dataclass
class Route:
    """Routing table entry"""
    destination: str  # e.g., "192.168.0.0/24" or "0.0.0.0/0"
    next_hop: str | None = None
    interface: str | None = None
    distance: int = 1
    metric: int = 0
    route_type: str = "static"  # 'static', 'connected', 'kernel', 'dynamic'


@dataclass
class ARPEntry:
    """ARP/NDP table entry"""
    ip_address: str
    mac_address: str
    interface: str
    age: int | None = None  # Age in seconds
    state: str = "REACHABLE"


@dataclass
class DNSServer:
    """DNS server configuration"""
    server: str
    vrf: str | None = None
    priority: int = 0


@dataclass
class DNSConfig:
    """DNS configuration"""
    domain_name: str | None = None
    name_servers: list[DNSServer] | None = None
    host_mapping: dict[str, str] | None = None


class NetworkConfigService:
    """Service for VyOS network configuration"""

    def __init__(self, executor: VyOSCommandExecutor):
        """Initialize service
        Args:
            executor: VyOS command executor
        """
        self.executor = executor

    # Interface Management

    def get_interfaces(self) -> list[NetworkInterface]:
        """Get all network interfaces
        Returns:
            List of NetworkInterface objects
        """
        # Get interfaces from VyOS
        result = self.executor.execute("/opt/vyatta/bin/vyatta-op-cmd-wrapper show interfaces")

        # Parse interface configuration
        interfaces = self._parse_interfaces_output(result.stdout)

        # Get full config to get all IP addresses
        config_result = self.executor.execute("/bin/cli-shell-api showCfg")
        self._update_ip_addresses_from_config(interfaces, config_result.stdout)

        return interfaces

    def _update_ip_addresses_from_config(self, interfaces: list[NetworkInterface], config: str):
        """Update interfaces with full IP address list from config"""
        current_iface = None
        parent_iface_for_vif = None
        in_interfaces = False
        brace_depth = 0

        for line in config.split('\n'):
            line = line.strip()

            if not line:
                continue

            if line.startswith('interfaces {'):
                in_interfaces = True
                brace_depth = 1
                continue

            if in_interfaces:
                # Count braces to track depth
                brace_depth += line.count('{') - line.count('}')
                if brace_depth <= 0:
                    in_interfaces = False
                    current_iface = None
                    parent_iface_for_vif = None
                    break

            if not in_interfaces:
                continue

            # Check for interface type sections: ethernet eth0 {
            match = re.match(r'^(ethernet|loopback|bridge|bonding|pppoe|openvpn|wireguard|virtual-ethernet)\s+([^{]+)\s*\{', line)
            if match:
                iface_type = match.group(1)
                iface_name = match.group(2).strip()
                # Find the interface in our list
                for iface in interfaces:
                    if iface.name == iface_name:
                        current_iface = iface
                        parent_iface_for_vif = iface_name
                        # Reset IP addresses to reload from config
                        current_iface.ip_addresses = []
                        break
                else:
                    current_iface = None
                    # Still keep track of parent for vif
                    parent_iface_for_vif = iface_name if '{' not in iface_name else parent_iface_for_vif
                continue

            # Check for vif sections (VLAN interfaces under physical interfaces)
            match_vif = re.match(r'^vif\s+(\d+)\s*\{', line)
            if match_vif and parent_iface_for_vif:
                vlan_id = match_vif.group(1)
                vlan_iface_name = f"{parent_iface_for_vif}.{vlan_id}"
                # Find the VLAN interface in our list
                for iface in interfaces:
                    if iface.name == vlan_iface_name:
                        current_iface = iface
                        # Reset IP addresses to reload from config
                        current_iface.ip_addresses = []
                        break
                else:
                    current_iface = None
                continue

            # Check for closing brace - go up one level
            if line == '}':
                if current_iface and '.' in current_iface.name:
                    # It was a VLAN interface, go back to parent
                    current_iface = None
                else:
                    current_iface = None

            # Check for address line
            if current_iface and 'address' in line and not line.startswith('#'):
                # Match: address 192.168.1.1/24
                match = re.search(r'address\s+[\'\"]?([^\'\"\s/]+/\d+)[\'\"]?', line)
                if match:
                    address = match.group(1)
                    if current_iface.ip_addresses is None:
                        current_iface.ip_addresses = []
                    # Avoid duplicates
                    exists = any(addr.get('address') == address for addr in current_iface.ip_addresses)
                    if not exists:
                        current_iface.ip_addresses.append({'address': address})

    def get_interface(self, name: str) -> NetworkInterface | None:
        """Get specific interface
        Args:
            name: Interface name
        Returns:
            NetworkInterface object or None
        """
        interfaces = self.get_interfaces()
        for iface in interfaces:
            if iface.name == name:
                return iface
        return None

    def _parse_interfaces_output(self, output: str) -> list[NetworkInterface]:
        """Parse VyOS show interfaces output"""
        interfaces = []
        lines = output.strip().split('\n')

        header_found = False
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if line.startswith('Codes:'):
                header_found = True
                continue
            if line.startswith('Interface') or line.startswith('-----------'):
                continue

            # Parse interface line
            parts = line.split()
            if len(parts) >= 6:
                iface_name = parts[0]

                # Find status - it should be something like 'u/u', 'u/D', etc.
                status = 'unknown'
                status_idx = -1
                for i, part in enumerate(parts):
                    if '/' in part and len(part) == 3:
                        # Looks like a status (u/u, u/D, A/D, D/D)
                        status = part
                        status_idx = i
                        break

                # Determine interface type
                if iface_name.startswith('eth'):
                    iface_type = 'ethernet'
                elif iface_name.startswith('lo'):
                    iface_type = 'loopback'
                elif iface_name.startswith('br'):
                    iface_type = 'bridge'
                elif iface_name.startswith('bond'):
                    iface_type = 'bonding'
                elif '.' in iface_name:
                    iface_type = 'vlan'
                else:
                    iface_type = 'ethernet'

                # Parse status
                status_map = {
                    'u/u': 'up',
                    'u/D': 'up',
                    'A/D': 'down',
                    'D/D': 'down',
                }
                status_str = status_map.get(status, 'unknown')

                # Collect all IP addresses - they are between iface_name and status
                ip_addresses = []
                # IP addresses are between index 1 and status_idx
                for i in range(1, status_idx if status_idx > 0 else len(parts)):
                    part = parts[i]
                    if '/' in part:
                        ip_addresses.append({'address': part})

                # Find MAC address - should have colons
                mac = None
                for part in parts:
                    if ':' in part and len(part) == 17:
                        mac = part
                        break

                # Find VRF and MTU - after status
                vrf = None
                mtu = 1500
                if status_idx > 0 and status_idx + 1 < len(parts):
                    # After status comes: S/L, vrf, mtu, ...
                    # Check the parts after status
                    for i in range(status_idx + 1, len(parts)):
                        part = parts[i]
                        if part.isdigit():
                            mtu = int(part)
                        elif not ('/' in part or ':' in part):
                            # Could be VRF if it's not an IP or MAC
                            if vrf is None and len(part) > 0 and not part in ['-', 'u', 'D', 'A']:
                                vrf = part

                interface = NetworkInterface(
                    name=iface_name,
                    type=iface_type,
                    status=status_str,
                    mtu=mtu,
                    mac_address=mac,
                    ip_addresses=ip_addresses,
                    vrf=vrf,
                )
                interfaces.append(interface)

        return interfaces

    # Routing Management

    def get_routes(self) -> list[Route]:
        """Get routing table
        Returns:
            List of Route objects
        """
        result = self.executor.execute("/opt/vyatta/bin/vyatta-op-cmd-wrapper show ip route")
        return self._parse_routes_output(result.stdout)

    def _parse_routes_output(self, output: str) -> list[Route]:
        """Parse VyOS show ip route output"""
        routes = []
        lines = output.strip().split('\n')

        for line in lines:
            line = line.strip()
            if not line:
                continue
            if line.startswith('Codes:'):
                continue
            if line.startswith('>') or line.startswith('C>') or line.startswith('S>') or line.startswith('C>*') or line.startswith('S>*') or line.startswith('K>') or line.startswith('K>*') or line.startswith('O>') or line.startswith('O>*'):
                # Parse route line
                parts = line.split()

                destination = None
                next_hop = None
                interface = None
                route_type = 'static'

                for i, part in enumerate(parts):
                    if part in ['S', 'S>*', 'C', 'C>*', 'K', 'K>*', 'O', 'O>*']:
                        if part.startswith('S'):
                            route_type = 'static'
                        elif part.startswith('C'):
                            route_type = 'connected'
                        elif part.startswith('K'):
                            route_type = 'kernel'
                        elif part.startswith('O'):
                            route_type = 'ospf'
                    elif '/' in part and not part.startswith('['):
                        destination = part
                    elif part == 'via' and i + 1 < len(parts):
                        next_hop = parts[i + 1].rstrip(',')
                    elif part.startswith('eth') or part.startswith('lo') or part.startswith('br') or part.startswith('bond'):
                        interface = part.rstrip(',')

                if destination:
                    route = Route(
                        destination=destination,
                        next_hop=next_hop,
                        interface=interface,
                        route_type=route_type,
                        distance=1,
                        metric=0,
                    )
                    routes.append(route)

        return routes

    # ARP/NDP Management

    def get_arp_table(self) -> list[ARPEntry]:
        """Get ARP table
        Returns:
            List of ARPEntry objects
        """
        result = self.executor.execute("/opt/vyatta/bin/vyatta-op-cmd-wrapper show arp")
        return self._parse_arp_output(result.stdout)

    def _parse_arp_output(self, output: str) -> list[ARPEntry]:
        """Parse VyOS show arp output"""
        entries = []
        lines = output.strip().split('\n')

        header_found = False
        for line in lines:
            line = line.strip()
            if not line:
                continue
            if line.startswith('Address'):
                header_found = True
                continue
            if line.startswith('------------'):
                continue

            # Parse ARP line
            parts = line.split()
            if len(parts) >= 3:
                ip_address = parts[0]
                interface = parts[1]
                mac_address = None
                state = 'UNKNOWN'

                for i, part in enumerate(parts):
                    if ':' in part and len(part) == 17:
                        mac_address = part
                    if part in ['REACHABLE', 'STALE', 'FAILED', 'INCOMPLETE', 'PERMANENT', 'DELAY']:
                        state = part

                if ip_address and mac_address:
                    entry = ARPEntry(
                        ip_address=ip_address,
                        mac_address=mac_address,
                        interface=interface,
                        state=state,
                    )
                    entries.append(entry)

        return entries

    def clear_arp_table(self, interface: str | None = None) -> bool:
        """Clear ARP table
        Args:
            interface: Optional interface name to clear
        Returns:
            True if successful
        """
        if interface:
            command = f"ip neigh flush dev {interface}"
        else:
            command = "ip neigh flush all"

        result = self.executor.execute(command)
        return result.exit_code == 0

    # DNS Management

    def get_dns_config(self) -> DNSConfig:
        """Get DNS configuration
        Returns:
            DNSConfig object
        """
        # Use cli-shell-api to get configuration - this is more reliable
        result = self.executor.execute("/bin/cli-shell-api showCfg --show-hide-secrets")

        # Parse DNS configuration
        name_servers = []
        domain_name = None

        for line in result.stdout.split("\n"):
            line = line.strip()
            if "name-server" in line:
                # Extract server address - handle both quoted and unquoted
                match = re.search(r'name-server\s+[\'"]?([^\'"\s]+)[\'"]?', line)
                if match:
                    name_servers.append(DNSServer(server=match.group(1)))
            elif "domain-name" in line:
                match = re.search(r'domain-name\s+[\'"]?([^\'"\s]+)[\'"]?', line)
                if match:
                    domain_name = match.group(1)

        return DNSConfig(domain_name=domain_name, name_servers=name_servers)

    def set_dns_servers(self, servers: list[str], vrf: str | None = None) -> bool:
        """Set DNS servers
        Args:
            servers: List of DNS server addresses
            vrf: Optional VRF name
        Returns:
            True if successful
        """
        # First delete existing name-servers
        commands = ["delete system name-server"]

        # Add new servers
        for server in servers:
            if vrf:
                commands.append(f"set system name-server {server} vrf {vrf}")
            else:
                commands.append(f"set system name-server {server}")

        result = self.executor.configure(commands)
        return result.exit_code == 0

    def set_domain_name(self, domain: str) -> bool:
        """Set system domain name
        Args:
            domain: Domain name
        Returns:
            True if successful
        """
        command = f"set system domain-name {domain}"
        result = self.executor.execute_config_mode(command)
        return result.exit_code == 0

    def add_dns_mapping(self, hostname: str, ip_address: str) -> bool:
        """Add hostname to IP mapping
        Args:
            hostname: Hostname
            ip_address: IP address
        Returns:
            True if successful
        """
        command = f"set system host-name {hostname} inet {ip_address}"
        result = self.executor.execute_config_mode(command)
        return result.exit_code == 0

    # IP Address Management

    def get_ip_addresses(self, interface: str | None = None) -> list[IPAddress]:
        """Get IP addresses
        Args:
            interface: Optional interface name filter
        Returns:
            List of IPAddress objects
        """
        addresses = []
        interfaces = self.get_interfaces()

        for iface in interfaces:
            if interface and iface.name != interface:
                continue
            if iface.ip_addresses:
                for addr in iface.ip_addresses:
                    addresses.append(IPAddress(address=addr.get("address", "")))

        return addresses

    # Configuration methods
    def create_interface(self, config: dict[str, Any]) -> bool:
        """Create a new network interface"""
        name = config.get("name", "")
        if not name:
            return False

        iface_type = config.get("type", "ethernet")
        description = config.get("description")
        mtu = config.get("mtu")

        commands = []
        if description:
            commands.append(f"set interfaces {iface_type} {name} description '{description}'")
        if mtu:
            commands.append(f"set interfaces {iface_type} {name} mtu {mtu}")

        if not commands:
            # No configuration to set
            return True

        result = self.executor.configure(commands)
        return result.status == CommandStatus.SUCCESS or result.exit_code == 0

    def update_interface(self, name: str, config: dict[str, Any]) -> bool:
        """Update an existing interface"""
        if not name:
            return False

        # First, get interface type
        interfaces = self.get_interfaces()
        iface = next((i for i in interfaces if i.name == name), None)
        iface_type = iface.type if iface else "ethernet"

        description = config.get("description")
        mtu = config.get("mtu")

        commands = []
        if description is not None:
            if description:
                commands.append(f"set interfaces {iface_type} {name} description '{description}'")
            else:
                commands.append(f"delete interfaces {iface_type} {name} description")
        if mtu:
            commands.append(f"set interfaces {iface_type} {name} mtu {mtu}")

        if not commands:
            return True

        result = self.executor.configure(commands)
        return result.status == CommandStatus.SUCCESS or result.exit_code == 0

    def delete_interface(self, name: str) -> bool:
        """Delete an interface"""
        if not name:
            return False

        # Get interface type first
        interfaces = self.get_interfaces()
        iface = next((i for i in interfaces if i.name == name), None)
        iface_type = iface.type if iface else "ethernet"

        command = f"delete interfaces {iface_type} {name}"
        result = self.executor.configure(command)
        return result.status == CommandStatus.SUCCESS or result.exit_code == 0

    def add_ip_address(self, interface: str, address: str) -> bool:
        """Add an IP address to an interface"""
        if not interface or not address:
            return False

        # Get interface type
        interfaces = self.get_interfaces()
        iface = next((i for i in interfaces if i.name == interface), None)
        iface_type = iface.type if iface else "ethernet"

        command = f"set interfaces {iface_type} {interface} address '{address}'"
        result = self.executor.configure(command)
        return result.status == CommandStatus.SUCCESS or result.exit_code == 0

    def remove_ip_address(self, interface: str, address: str) -> bool:
        """Remove an IP address from an interface"""
        if not interface or not address:
            return False

        # Get interface type
        interfaces = self.get_interfaces()
        iface = next((i for i in interfaces if i.name == interface), None)
        iface_type = iface.type if iface else "ethernet"

        command = f"delete interfaces {iface_type} {interface} address '{address}'"
        result = self.executor.configure(command)
        return result.status == CommandStatus.SUCCESS or result.exit_code == 0

    def add_route(self, config: dict[str, Any]) -> bool:
        """Add a static route"""
        destination = config.get("destination")
        if not destination:
            return False

        next_hop = config.get("next_hop")
        interface = config.get("interface")
        distance = config.get("distance", 1)

        commands = []
        if next_hop:
            commands.append(f"set protocols static route {destination} next-hop '{next_hop}'")
            if distance != 1:
                commands.append(f"set protocols static route {destination} distance {distance}")
        elif interface:
            commands.append(f"set protocols static route {destination} interface '{interface}'")
        else:
            return False

        result = self.executor.configure(commands)
        return result.status == CommandStatus.SUCCESS or result.exit_code == 0

    def delete_route(self, destination: str, next_hop: str | None = None) -> bool:
        """Delete a route"""
        if not destination:
            return False

        command = f"delete protocols static route {destination}"
        result = self.executor.configure(command)
        return result.status == CommandStatus.SUCCESS or result.exit_code == 0

"""VyOS Command Output Parser"""
import re
from dataclasses import dataclass
from typing import Any


@dataclass
class ParsedInterface:
    """Parsed network interface information"""

    name: str
    description: str | None = None
    ip_addresses: list[str] | None = None
    mac_address: str | None = None
    status: str | None = None
    mtu: int | None = None
    speed: str | None = None
    duplex: str | None = None


@dataclass
class ParsedRoute:
    """Parsed routing information"""

    destination: str
    gateway: str | None = None
    interface: str | None = None
    metric: int | None = None
    route_type: str | None = None


class VyOSOutputParser:
    """Parser for VyOS command output"""

    @staticmethod
    def parse_interfaces(output: str) -> list[ParsedInterface]:
        """Parse interface list from 'show interfaces' command

        Args:
            output: Command output

        Returns:
            List of ParsedInterface objects
        """
        interfaces: list[ParsedInterface] = []
        current_interface: dict[str, Any] | None = None

        for line in output.split("\n"):
            line = line.strip()

            # Detect interface header (e.g., "eth0")
            if re.match(r"^[a-z]+[0-9]+(\.[0-9]+)*$", line):
                if current_interface:
                    interfaces.append(ParsedInterface(**current_interface))

                current_interface = {"name": line, "ip_addresses": []}
                continue

            # Parse interface properties
            if current_interface:
                if "Description:" in line:
                    current_interface["description"] = line.split("Description:")[1].strip()
                elif "MAC Address:" in line:
                    current_interface["mac_address"] = line.split("MAC Address:")[1].strip()
                elif "Status:" in line:
                    current_interface["status"] = line.split("Status:")[1].strip()
                elif "MTU:" in line:
                    current_interface["mtu"] = int(line.split("MTU:")[1].strip())
                elif "Speed:" in line:
                    current_interface["speed"] = line.split("Speed:")[1].strip()
                elif "Duplex:" in line:
                    current_interface["duplex"] = line.split("Duplex:")[1].strip()
                elif re.match(r"^\s*(IPv4|IPv6):", line):
                    ip = line.split(":")[1].strip()
                    if current_interface["ip_addresses"]:
                        current_interface["ip_addresses"].append(ip)

        # Add last interface
        if current_interface:
            interfaces.append(ParsedInterface(**current_interface))

        return interfaces

    @staticmethod
    def parse_routes(output: str) -> list[ParsedRoute]:
        """Parse routing table from 'show ip route' command

        Args:
            output: Command output

        Returns:
            List of ParsedRoute objects
        """
        routes: list[ParsedRoute] = []

        # Example VyOS route output format:
        # C    192.168.1.0/24 dev eth0 proto kernel scope link src 192.168.1.1
        # S    0.0.0.0/0 via 192.168.1.254 dev eth0

        for line in output.split("\n"):
            line = line.strip()

            # Skip empty lines and headers
            if not line or line.startswith("Destination"):
                continue

            # Parse route
            if re.match(r"^[CS]\s+", line):
                parts = line.split()
                if len(parts) >= 2:
                    route_type_code = parts[0]
                    destination = parts[1]

                    route_type = {
                        "C": "connected",
                        "S": "static",
                        "K": "kernel",
                        "B": "BGP",
                        "O": "OSPF",
                        "R": "RIP",
                    }.get(route_type_code, "unknown")

                    gateway = None
                    interface = None

                    # Find gateway and interface
                    for i, part in enumerate(parts):
                        if part == "via" and i + 1 < len(parts):
                            gateway = parts[i + 1]
                        elif part == "dev" and i + 1 < len(parts):
                            interface = parts[i + 1]
                            break

                    routes.append(
                        ParsedRoute(
                            destination=destination,
                            gateway=gateway,
                            interface=interface,
                            route_type=route_type,
                        )
                    )

        return routes

    @staticmethod
    def parse_system_info(output: str) -> dict[str, str]:
        """Parse system information from 'show version' command

        Args:
            output: Command output

        Returns:
            Dictionary with system information
        """
        info: dict[str, str] = {}

        for line in output.split("\n"):
            line = line.strip()

            # Parse key-value pairs
            if ":" in line:
                key, value = line.split(":", 1)
                info[key.strip().lower().replace(" ", "_")] = value.strip()

        return info

    @staticmethod
    def parse_key_value(output: str, separator: str = ":") -> dict[str, str]:
        """Parse generic key-value output

        Args:
            output: Command output
            separator: Key-value separator

        Returns:
            Dictionary with key-value pairs
        """
        result: dict[str, str] = {}

        for line in output.split("\n"):
            line = line.strip()

            if separator in line:
                key, value = line.split(separator, 1)
                result[key.strip()] = value.strip()

        return result

    @staticmethod
    def parse_table(output: str, delimiter: str = None) -> list[dict[str, str]]:
        """Parse tabular output

        Args:
            output: Command output
            delimiter: Column delimiter (auto-detect if None)

        Returns:
            List of dictionaries with column names as keys
        """
        lines = [line.strip() for line in output.split("\n") if line.strip()]

        if len(lines) < 2:
            return []

        # Auto-detect delimiter
        if delimiter is None:
            # Look for common delimiters
            if "\t" in lines[0]:
                delimiter = "\t"
            elif re.search(r"\s{2,}", lines[0]):
                delimiter = r"\s+"
            else:
                delimiter = " "

        # Parse header
        headers = re.split(delimiter, lines[0]) if delimiter != " " else lines[0].split()

        # Parse rows
        rows: list[dict[str, str]] = []
        for line in lines[1:]:
            values = re.split(delimiter, line) if delimiter != " " else line.split(delimiter)

            row: dict[str, str] = {}
            for i, header in enumerate(headers):
                if i < len(values):
                    row[header.strip()] = values[i].strip()

            rows.append(row)

        return rows

"""VyOS Firewall Configuration Service"""
import re
from dataclasses import dataclass, field
from typing import Any
from enum import Enum

from app.services.vyos_command import VyOSCommandExecutor


class FirewallDirection(str, Enum):
    """Firewall direction"""

    IN = "in"
    OUT = "out"
    LOCAL = "local"


class FirewallAction(str, Enum):
    """Firewall action"""

    ACCEPT = "accept"
    DROP = "drop"
    REJECT = "reject"
    LOG = "log"


class Protocol(str, Enum):
    """Network protocol"""

    TCP = "tcp"
    UDP = "udp"
    ICMP = "icmp"
    TCP_UDP = "tcp_udp"
    ALL = "all"


class NATType(str, Enum):
    """NAT type"""

    SOURCE = "source"
    DESTINATION = "destination"
    MASQUERADE = "masquerade"
    PORT_FORWARD = "port-forward"


@dataclass
class FirewallRule:
    """Firewall rule definition"""

    name: str
    direction: FirewallDirection = FirewallDirection.IN
    action: FirewallAction = FirewallAction.ACCEPT
    sequence: int = 10
    description: str | None = None
    enabled: bool = True
    source_address: str | None = None  # CIDR
    source_port: int | None = None
    source_port_range: str | None = None  # "start-end"
    destination_address: str | None = None  # CIDR
    destination_port: int | None = None
    destination_port_range: str | None = None  # "start-end"
    protocol: Protocol | None = None
    state: list[str] | None = None  # e.g., ["established", "related"]
    interface: str | None = None
    log: bool = False
    log_prefix: str | None = None


@dataclass
class NATRule:
    """NAT rule definition"""

    name: str
    type: NATType = NATType.SOURCE
    sequence: int = 10
    description: str | None = None
    enabled: bool = True
    source_address: str | None = None
    destination_address: str | None = None
    outbound_interface: str | None = None
    translation_address: str | None = None
    port: int | None = None
    port_range: str | None = None
    protocol: Protocol | None = None
    log: bool = False


@dataclass
class RuleConflict:
    """Rule conflict information"""

    rule1: str
    rule2: str
    conflict_type: str  # "overlap", "duplicate", "invalid_order"
    description: str


class FirewallService:
    """Service for VyOS firewall configuration"""

    def __init__(self, executor: VyOSCommandExecutor):
        """Initialize service

        Args:
            executor: VyOS command executor
        """
        self.executor = executor

    # Firewall Rule Management

    def get_rules(self, direction: FirewallDirection | None = None) -> list[FirewallRule]:
        """Get firewall rules

        Args:
            direction: Optional direction filter

        Returns:
            List of FirewallRule objects
        """
        rules = []

        if direction:
            result = self.executor.execute_show(f"firewall name {direction.value}")
            rules.extend(self._parse_rules(result.stdout, direction.value))
        else:
            for dir_value in [FirewallDirection.IN, FirewallDirection.OUT, FirewallDirection.LOCAL]:
                result = self.executor.execute_show(f"firewall name {dir_value.value}")
                rules.extend(self._parse_rules(result.stdout, dir_value.value))

        return sorted(rules, key=lambda r: r.sequence)

    def get_rule(self, name: str, direction: FirewallDirection) -> FirewallRule | None:
        """Get specific firewall rule

        Args:
            name: Rule name
            direction: Firewall direction

        Returns:
            FirewallRule object or None
        """
        rules = self.get_rules(direction)

        for rule in rules:
            if rule.name == name:
                return rule

        return None

    def create_rule(self, rule: FirewallRule) -> bool:
        """Create a firewall rule

        Args:
            rule: FirewallRule object

        Returns:
            True if successful
        """
        # Validate rule
        conflicts = self.validate_rule(rule)
        if conflicts:
            raise ValueError(f"Rule validation failed: {conflicts[0].description}")

        # Build configuration commands
        commands = self._build_rule_commands(rule, create=True)

        result = self.executor.configure(commands)
        return result.exit_code == 0

    def update_rule(self, name: str, direction: FirewallDirection, updates: dict[str, Any]) -> bool:
        """Update a firewall rule

        Args:
            name: Rule name
            direction: Firewall direction
            updates: Rule updates

        Returns:
            True if successful
        """
        # Get existing rule
        existing = self.get_rule(name, direction)
        if not existing:
            raise ValueError(f"Rule {name} not found in {direction} chain")

        # Build delete commands for existing rule
        delete_commands = self._build_rule_commands(existing, create=False)

        # Update rule with new values
        for key, value in updates.items():
            if hasattr(existing, key):
                setattr(existing, key, value)

        # Build create commands for updated rule
        create_commands = self._build_rule_commands(existing, create=True)

        # Execute delete and create
        commands = delete_commands + create_commands
        result = self.executor.configure(commands)
        return result.exit_code == 0

    def delete_rule(self, name: str, direction: FirewallDirection) -> bool:
        """Delete a firewall rule

        Args:
            name: Rule name
            direction: Firewall direction

        Returns:
            True if successful
        """
        rule = self.get_rule(name, direction)
        if not rule:
            raise ValueError(f"Rule {name} not found in {direction} chain")

        commands = self._build_rule_commands(rule, create=False)
        result = self.executor.configure(commands)
        return result.exit_code == 0

    def move_rule(self, name: str, direction: FirewallDirection, new_sequence: int) -> bool:
        """Move a rule to a new sequence number

        Args:
            name: Rule name
            direction: Firewall direction
            new_sequence: New sequence number

        Returns:
            True if successful
        """
        # Get existing rule
        rule = self.get_rule(name, direction)
        if not rule:
            raise ValueError(f"Rule {name} not found in {direction} chain")

        # Delete and recreate with new sequence
        old_sequence = rule.sequence
        rule.sequence = new_sequence

        commands = [
            f"delete firewall name {direction.value} rule {old_sequence}",
        ]
        commands.extend(self._build_rule_commands(rule, create=True))

        result = self.executor.configure(commands)
        return result.exit_code == 0

    def enable_rule(self, name: str, direction: FirewallDirection) -> bool:
        """Enable a firewall rule

        Args:
            name: Rule name
            direction: Firewall direction

        Returns:
            True if successful
        """
        return self.update_rule(name, direction, {"enabled": True})

    def disable_rule(self, name: str, direction: FirewallDirection) -> bool:
        """Disable a firewall rule

        Args:
            name: Rule name
            direction: Firewall direction

        Returns:
            True if successful
        """
        return self.update_rule(name, direction, {"enabled": False})

    # NAT Rule Management

    def get_nat_rules(self, nat_type: NATType | None = None) -> list[NATRule]:
        """Get NAT rules

        Args:
            nat_type: Optional NAT type filter

        Returns:
            List of NATRule objects
        """
        rules = []

        if nat_type:
            result = self.executor.execute_show(f"nat {nat_type.value} rule")
            rules.extend(self._parse_nat_rules(result.stdout, nat_type.value))
        else:
            for type_value in [NATType.SOURCE, NATType.DESTINATION, NATType.MASQUERADE]:
                result = self.executor.execute_show(f"nat {type_value.value} rule")
                rules.extend(self._parse_nat_rules(result.stdout, type_value.value))

        return sorted(rules, key=lambda r: r.sequence)

    def get_nat_rule(self, name: str, nat_type: NATType) -> NATRule | None:
        """Get specific NAT rule

        Args:
            name: Rule name
            nat_type: NAT type

        Returns:
            NATRule object or None
        """
        rules = self.get_nat_rules(nat_type)

        for rule in rules:
            if rule.name == name:
                return rule

        return None

    def create_nat_rule(self, rule: NATRule) -> bool:
        """Create a NAT rule

        Args:
            rule: NATRule object

        Returns:
            True if successful
        """
        # Build configuration commands
        commands = self._build_nat_rule_commands(rule, create=True)

        result = self.executor.configure(commands)
        return result.exit_code == 0

    def update_nat_rule(self, name: str, nat_type: NATType, updates: dict[str, Any]) -> bool:
        """Update a NAT rule

        Args:
            name: Rule name
            nat_type: NAT type
            updates: Rule updates

        Returns:
            True if successful
        """
        # Get existing rule
        existing = self.get_nat_rule(name, nat_type)
        if not existing:
            raise ValueError(f"NAT rule {name} not found")

        # Build delete commands
        delete_commands = self._build_nat_rule_commands(existing, create=False)

        # Update rule
        for key, value in updates.items():
            if hasattr(existing, key):
                setattr(existing, key, value)

        # Build create commands
        create_commands = self._build_nat_rule_commands(existing, create=True)

        commands = delete_commands + create_commands
        result = self.executor.configure(commands)
        return result.exit_code == 0

    def delete_nat_rule(self, name: str, nat_type: NATType) -> bool:
        """Delete a NAT rule

        Args:
            name: Rule name
            nat_type: NAT type

        Returns:
            True if successful
        """
        rule = self.get_nat_rule(name, nat_type)
        if not rule:
            raise ValueError(f"NAT rule {name} not found")

        commands = self._build_nat_rule_commands(rule, create=False)
        result = self.executor.configure(commands)
        return result.exit_code == 0

    # Rule Validation

    def validate_rule(self, rule: FirewallRule) -> list[RuleConflict]:
        """Validate a firewall rule for conflicts

        Args:
            rule: FirewallRule to validate

        Returns:
            List of RuleConflict objects (empty if valid)
        """
        conflicts = []

        # Get existing rules in same direction
        existing_rules = self.get_rules(rule.direction)

        for existing in existing_rules:
            # Check for duplicate rule name
            if existing.name == rule.name:
                conflicts.append(RuleConflict(
                    rule1=rule.name,
                    rule2=existing.name,
                    conflict_type="duplicate",
                    description=f"Rule with name '{rule.name}' already exists"
                ))

            # Check for overlapping rules (same protocol and ports)
            if self._rules_overlap(rule, existing):
                conflicts.append(RuleConflict(
                    rule1=rule.name,
                    rule2=existing.name,
                    conflict_type="overlap",
                    description=f"Rule overlaps with existing rule '{existing.name}'"
                ))

        # Validate port ranges
        if rule.source_port_range:
            if not self._is_valid_port_range(rule.source_port_range):
                conflicts.append(RuleConflict(
                    rule1=rule.name,
                    rule2="",
                    conflict_type="invalid",
                    description="Invalid source port range format"
                ))

        if rule.destination_port_range:
            if not self._is_valid_port_range(rule.destination_port_range):
                conflicts.append(RuleConflict(
                    rule1=rule.name,
                    rule2="",
                    conflict_type="invalid",
                    description="Invalid destination port range format"
                ))

        return conflicts

    # Import/Export

    def export_rules(self, direction: FirewallDirection | None = None) -> dict[str, Any]:
        """Export firewall rules

        Args:
            direction: Optional direction filter

        Returns:
            Dictionary with exported rules
        """
        rules = self.get_rules(direction)

        return {
            "version": "1.0",
            "direction": direction.value if direction else "all",
            "rules": [
                {
                    "name": r.name,
                    "direction": r.direction.value,
                    "action": r.action.value,
                    "sequence": r.sequence,
                    "description": r.description,
                    "enabled": r.enabled,
                    "source_address": r.source_address,
                    "source_port": r.source_port,
                    "source_port_range": r.source_port_range,
                    "destination_address": r.destination_address,
                    "destination_port": r.destination_port,
                    "destination_port_range": r.destination_port_range,
                    "protocol": r.protocol.value if r.protocol else None,
                    "state": r.state,
                    "interface": r.interface,
                    "log": r.log,
                    "log_prefix": r.log_prefix,
                }
                for r in rules
            ],
        }

    def import_rules(self, rules_data: dict[str, Any], replace: bool = False) -> dict[str, Any]:
        """Import firewall rules

        Args:
            rules_data: Rules data to import
            replace: If True, replace all existing rules

        Returns:
            Import result with success/failure counts
        """
        result = {
            "total": 0,
            "success": 0,
            "failed": 0,
            "errors": [],
        }

        if replace:
            # Delete all existing rules in the direction
            for dir_value in [FirewallDirection.IN, FirewallDirection.OUT, FirewallDirection.LOCAL]:
                commands = []
                for rule in self.get_rules(dir_value):
                    commands.append(f"delete firewall name {dir_value.value} rule {rule.sequence}")
                if commands:
                    self.executor.configure(commands)

        for rule_data in rules_data.get("rules", []):
            result["total"] += 1

            try:
                # Build rule from data
                rule = FirewallRule(
                    name=rule_data.get("name", ""),
                    direction=FirewallDirection(rule_data.get("direction", "in")),
                    action=FirewallAction(rule_data.get("action", "accept")),
                    sequence=rule_data.get("sequence", 10),
                    description=rule_data.get("description"),
                    enabled=rule_data.get("enabled", True),
                    source_address=rule_data.get("source_address"),
                    source_port=rule_data.get("source_port"),
                    source_port_range=rule_data.get("source_port_range"),
                    destination_address=rule_data.get("destination_address"),
                    destination_port=rule_data.get("destination_port"),
                    destination_port_range=rule_data.get("destination_port_range"),
                    protocol=Protocol(rule_data["protocol"]) if rule_data.get("protocol") else None,
                    state=rule_data.get("state"),
                    interface=rule_data.get("interface"),
                    log=rule_data.get("log", False),
                    log_prefix=rule_data.get("log_prefix"),
                )

                if self.create_rule(rule):
                    result["success"] += 1
                else:
                    result["failed"] += 1
                    result["errors"].append(f"Failed to create rule: {rule.name}")

            except Exception as e:
                result["failed"] += 1
                result["errors"].append(f"Error importing rule: {str(e)}")

        return result

    # Helper Methods

    def _parse_rules(self, output: str, direction: str) -> list[FirewallRule]:
        """Parse firewall rules output"""
        rules = []
        current_rule = None

        for line in output.split("\n"):
            line = line.strip()

            # Detect rule definition
            if line.startswith("rule"):
                parts = line.split()
                if len(parts) >= 2:
                    sequence = int(parts[1])

                    if current_rule:
                        rules.append(current_rule)

                    current_rule = FirewallRule(
                        name=f"rule_{sequence}",
                        direction=FirewallDirection(direction),
                        sequence=sequence,
                    )

            elif current_rule and "action" in line:
                match = re.search(r'action\s+(\w+)', line)
                if match:
                    current_rule.action = FirewallAction(match.group(1))

            elif current_rule and "description" in line:
                match = re.search(r'description\s+"([^"]+)"', line)
                if match:
                    current_rule.description = match.group(1)

            elif current_rule and "source" in line and "address" in line:
                match = re.search(r'address\s+(\S+)', line)
                if match:
                    current_rule.source_address = match.group(1)

            elif current_rule and "destination" in line and "address" in line:
                match = re.search(r'address\s+(\S+)', line)
                if match:
                    current_rule.destination_address = match.group(1)

            elif current_rule and "protocol" in line:
                match = re.search(r'protocol\s+(\w+)', line)
                if match:
                    current_rule.protocol = Protocol(match.group(1))

            elif current_rule and "log" in line and "enable" in line:
                current_rule.log = True

            elif current_rule and "log" in line and "prefix" in line:
                match = re.search(r'prefix\s+"([^"]+)"', line)
                if match:
                    current_rule.log_prefix = match.group(1)

        if current_rule:
            rules.append(current_rule)

        return rules

    def _parse_nat_rules(self, output: str, nat_type: str) -> list[NATRule]:
        """Parse NAT rules output"""
        rules = []
        current_rule = None

        for line in output.split("\n"):
            line = line.strip()

            # Detect rule definition
            if line.startswith("rule"):
                parts = line.split()
                if len(parts) >= 2:
                    sequence = int(parts[1])

                    if current_rule:
                        rules.append(current_rule)

                    current_rule = NATRule(
                        name=f"nat_rule_{sequence}",
                        type=NATType(nat_type),
                        sequence=sequence,
                    )

            elif current_rule and "description" in line:
                match = re.search(r'description\s+"([^"]+)"', line)
                if match:
                    current_rule.description = match.group(1)

            elif current_rule and "source" in line and "address" in line:
                match = re.search(r'address\s+(\S+)', line)
                if match:
                    current_rule.source_address = match.group(1)

            elif current_rule and "destination" in line and "address" in line:
                match = re.search(r'address\s+(\S+)', line)
                if match:
                    current_rule.destination_address = match.group(1)

            elif current_rule and "outbound-interface" in line:
                match = re.search(r'outbound-interface\s+(\S+)', line)
                if match:
                    current_rule.outbound_interface = match.group(1)

            elif current_rule and "translation" in line and "address" in line:
                match = re.search(r'address\s+(\S+)', line)
                if match:
                    current_rule.translation_address = match.group(1)

        if current_rule:
            rules.append(current_rule)

        return rules

    def _build_rule_commands(self, rule: FirewallRule, create: bool) -> list[str]:
        """Build configuration commands for a firewall rule"""
        base = f"firewall name {rule.direction.value} rule {rule.sequence}"

        if create:
            commands = [
                f"set {base} action {rule.action.value}",
            ]
        else:
            commands = [f"delete {base}"]

        if not create:
            return commands

        if rule.description:
            commands.append(f"set {base} description \"{rule.description}\"")

        if rule.source_address:
            commands.append(f"set {base} source address {rule.source_address}")

        if rule.destination_address:
            commands.append(f"set {base} destination address {rule.destination_address}")

        if rule.protocol:
            commands.append(f"set {base} protocol {rule.protocol.value}")

        if rule.state:
            for state_value in rule.state:
                commands.append(f"set {base} state {state_value} enable")

        if rule.interface:
            commands.append(f"set {base} source interface {rule.interface}")

        if rule.source_port:
            commands.append(f"set {base} source port {rule.source_port}")

        if rule.destination_port:
            commands.append(f"set {base} destination port {rule.destination_port}")

        if rule.log:
            commands.append(f"set {base} log enable")

        if rule.log_prefix:
            commands.append(f"set {base} log prefix \"{rule.log_prefix}\"")

        return commands

    def _build_nat_rule_commands(self, rule: NATRule, create: bool) -> list[str]:
        """Build configuration commands for a NAT rule"""
        base = f"nat {rule.type.value} rule {rule.sequence}"

        if not create:
            return [f"delete {base}"]

        commands = []

        if rule.description:
            commands.append(f"set {base} description \"{rule.description}\"")

        if rule.source_address:
            commands.append(f"set {base} source address {rule.source_address}")

        if rule.destination_address:
            commands.append(f"set {base} destination address {rule.destination_address}")

        if rule.outbound_interface:
            commands.append(f"set {base} outbound-interface {rule.outbound_interface}")

        if rule.translation_address:
            commands.append(f"set {base} translation address {rule.translation_address}")

        return commands

    def _rules_overlap(self, rule1: FirewallRule, rule2: FirewallRule) -> bool:
        """Check if two rules overlap"""
        # Same protocol
        if rule1.protocol != rule2.protocol and rule1.protocol and rule2.protocol:
            return False

        # Overlapping source/destination addresses
        if rule1.source_address and rule2.source_address:
            if not self._cidrs_overlap(rule1.source_address, rule2.source_address):
                return False

        if rule1.destination_address and rule2.destination_address:
            if not self._cidrs_overlap(rule1.destination_address, rule2.destination_address):
                return False

        return True

    def _cidrs_overlap(self, cidr1: str, cidr2: str) -> bool:
        """Check if two CIDR ranges overlap"""
        # Simplified overlap check
        return True

    def _is_valid_port_range(self, port_range: str) -> bool:
        """Validate port range format"""
        if "-" not in port_range:
            return False

        try:
            start, end = port_range.split("-")
            return 1 <= int(start) <= 65535 and 1 <= int(end) <= 65535 and int(start) <= int(end)
        except ValueError:
            return False

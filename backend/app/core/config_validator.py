"""VyOS Configuration Validator"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.core.config_parser import ConfigNode


@dataclass
class ValidationError:
    """Configuration validation error"""

    path: str
    message: str
    error_type: str  # 'required', 'invalid_type', 'invalid_value', 'range', 'pattern', 'custom'


@dataclass
class ValidationRule:
    """Configuration validation rule"""

    required: bool = False
    data_type: type | None = None  # str, int, bool, etc.
    min_value: int | float | None = None
    max_value: int | float | None = None
    allowed_values: list[Any] | None = None
    pattern: str | None = None  # regex pattern
    custom_validator: callable | None = None


class VyOSConfigValidator:
    """Validator for VyOS configuration"""

    # Predefined validation rules for common configuration paths
    STANDARD_RULES: dict[str, ValidationRule] = {
        # Interface configuration
        "interface.*.address": ValidationRule(
            required=False,
            pattern=r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}/\d{1,2}$",
        ),
        "interface.*.mtu": ValidationRule(
            required=False,
            data_type=int,
            min_value=68,
            max_value=9000,
        ),
        # System configuration
        "system.host-name": ValidationRule(required=False, pattern=r"^[a-zA-Z0-9-]+$"),
        "system.time-zone": ValidationRule(required=False, allowed_values=["UTC", "America/New_York", "Europe/London"]),
        # NTP configuration
        "system.time-server.*": ValidationRule(required=False, pattern=r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$"),
        # DNS configuration
        "system.name-server.*": ValidationRule(required=False, pattern=r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$"),
        # SSH configuration
        "service.ssh.port": ValidationRule(required=False, data_type=int, min_value=1, max_value=65535),
        "service.ssh.allow-root": ValidationRule(required=False, data_type=bool),
        # Firewall configuration
        "firewall.name.*.rule.*.action": ValidationRule(
            required=True,
            allowed_values=["accept", "drop", "reject"],
        ),
        # VPN configuration
        "vpn.ipsec.*.remote-address": ValidationRule(
            required=True,
            pattern=r"^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$",
        ),
    }

    def __init__(self, custom_rules: dict[str, ValidationRule] | None = None):
        """Initialize validator

        Args:
            custom_rules: Custom validation rules to add/override
        """
        self.rules = self.STANDARD_RULES.copy()

        if custom_rules:
            self.rules.update(custom_rules)

    def validate(self, config: ConfigNode) -> list[ValidationError]:
        """Validate configuration

        Args:
            config: Configuration tree to validate

        Returns:
            List of validation errors
        """
        errors: list[ValidationError] = []

        def _validate_node(node: ConfigNode, path_prefix: str = ""):
            # Check node value
            if node.value is not None:
                node_path = path_prefix.rstrip(".")

                # Find matching rule
                rule = self._find_matching_rule(node_path)

                if rule:
                    node_errors = self._validate_value(node_path, node.value, rule)
                    errors.extend(node_errors)

            # Validate children
            for name, child in node.children.items():
                if not child.deleted:
                    new_path = f"{path_prefix}{name}." if path_prefix else f"{name}."
                    _validate_node(child, new_path)

        _validate_node(config)
        return errors

    def _find_matching_rule(self, path: str) -> ValidationRule | None:
        """Find validation rule for path

        Args:
            path: Configuration path

        Returns:
            Matching ValidationRule or None
        """
        # Exact match first
        if path in self.rules:
            return self.rules[path]

        # Pattern matching
        for rule_path, rule in self.rules.items():
            if self._path_matches(rule_path, path):
                return rule

        return None

    def _path_matches(self, pattern: str, path: str) -> bool:
        """Check if path matches pattern

        Args:
            pattern: Rule pattern (may contain wildcards)
            path: Configuration path

        Returns:
            True if pattern matches path
        """
        pattern_parts = pattern.split(".")
        path_parts = path.split(".")

        if len(pattern_parts) != len(path_parts):
            return False

        for pattern_part, path_part in zip(pattern_parts, path_parts):
            if pattern_part == "*":
                continue
            if pattern_part != path_part:
                return False

        return True

    def _validate_value(self, path: str, value: Any, rule: ValidationRule) -> list[ValidationError]:
        """Validate a value against a rule

        Args:
            path: Configuration path
            value: Value to validate
            rule: Validation rule

        Returns:
            List of validation errors
        """
        errors: list[ValidationError] = []

        # Check required
        if rule.required and value is None:
            errors.append(ValidationError(path=path, message="Required value is missing", error_type="required"))
            return errors

        # Skip further checks if value is None
        if value is None:
            return errors

        # Check data type
        if rule.data_type is not None:
            try:
                if rule.data_type == int:
                    value = int(value)
                elif rule.data_type == float:
                    value = float(value)
                elif rule.data_type == bool:
                    value = bool(value)
                elif rule.data_type == str:
                    value = str(value)
            except (ValueError, TypeError):
                errors.append(
                    ValidationError(
                        path=path,
                        message=f"Invalid type, expected {rule.data_type.__name__}",
                        error_type="invalid_type",
                    )
                )
                return errors

        # Check min/max
        if rule.min_value is not None and isinstance(value, (int, float)):
            if value < rule.min_value:
                errors.append(
                    ValidationError(
                        path=path,
                        message=f"Value {value} is below minimum {rule.min_value}",
                        error_type="range",
                    )
                )

        if rule.max_value is not None and isinstance(value, (int, float)):
            if value > rule.max_value:
                errors.append(
                    ValidationError(
                        path=path,
                        message=f"Value {value} exceeds maximum {rule.max_value}",
                        error_type="range",
                    )
                )

        # Check allowed values
        if rule.allowed_values is not None:
            if value not in rule.allowed_values:
                errors.append(
                    ValidationError(
                        path=path,
                        message=f"Value {value} not in allowed values: {rule.allowed_values}",
                        error_type="invalid_value",
                    )
                )

        # Check pattern
        if rule.pattern is not None:
            import re

            if not re.match(rule.pattern, str(value)):
                errors.append(
                    ValidationError(
                        path=path,
                        message=f"Value {value} does not match pattern: {rule.pattern}",
                        error_type="pattern",
                    )
                )

        # Custom validator
        if rule.custom_validator is not None:
            try:
                result = rule.custom_validator(value)
                if result is not True:
                    errors.append(
                        ValidationError(
                            path=path,
                            message=str(result) if result else "Custom validation failed",
                            error_type="custom",
                        )
                    )
            except Exception as e:
                errors.append(
                    ValidationError(
                        path=path,
                        message=f"Custom validation error: {e}",
                        error_type="custom",
                    )
                )

        return errors

    def add_rule(self, path: str, rule: ValidationRule) -> None:
        """Add or update a validation rule

        Args:
            path: Configuration path pattern
            rule: Validation rule
        """
        self.rules[path] = rule

    def remove_rule(self, path: str) -> None:
        """Remove a validation rule

        Args:
            path: Configuration path pattern
        """
        if path in self.rules:
            del self.rules[path]

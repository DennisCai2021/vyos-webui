"""VyOS Configuration Syntax Parser"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

from app.core.config_parser import ConfigNode, ConfigDiff


@dataclass
class ConfigCommand:
    """Parsed VyOS configuration command"""

    command_type: str  # set, delete, comment, rename, etc.
    path: list[str]
    value: Any | None = None
    original: str = ""


class VyOSSyntaxParser:
    """Parser for VyOS configuration syntax"""

    # VyOS configuration command patterns
    SET_PATTERN = re.compile(r"^\s*set\s+(.+)$", re.IGNORECASE)
    DELETE_PATTERN = re.compile(r"^\s*delete\s+(.+)$", re.IGNORECASE)
    COMMENT_PATTERN = re.compile(r"^\s*comment\s+(.+?)\s+(.+)$", re.IGNORECASE)
    RENAME_PATTERN = re.compile(r"^\s*rename\s+(.+?)\s+to\s+(.+)$", re.IGNORECASE)
    EDIT_PATTERN = re.compile(r"^\s*edit\s+(.+)$", re.IGNORECASE)

    # Value pattern for set commands (e.g., "interface eth0 address 192.168.1.1/24")
    VALUE_PATTERN = re.compile(r"^\s*([^ ]+)\s+(.+)$")

    def __init__(self):
        """Initialize parser"""
        self.config_root = ConfigNode()

    def parse_line(self, line: str) -> ConfigCommand | None:
        """Parse a single configuration line

        Args:
            line: Configuration line

        Returns:
            ConfigCommand or None if line is empty/comment
        """
        line = line.strip()

        # Skip empty lines and comments
        if not line or line.startswith("#") or line.startswith("!"):
            return None

        # Parse set command
        if match := self.SET_PATTERN.match(line):
            return self._parse_set_command(match, line)

        # Parse delete command
        if match := self.DELETE_PATTERN.match(line):
            return self._parse_delete_command(match, line)

        # Parse comment command
        if match := self.COMMENT_PATTERN.match(line):
            return self._parse_comment_command(match, line)

        # Parse rename command
        if match := self.RENAME_PATTERN.match(line):
            return self._parse_rename_command(match, line)

        # Parse edit command
        if match := self.EDIT_PATTERN.match(line):
            return self._parse_edit_command(match, line)

        return None

    def _parse_set_command(self, match: re.Match[str], original: str) -> ConfigCommand:
        """Parse set command"""
        path_str = match.group(1).strip()
        path, value = self._split_path_and_value(path_str)

        return ConfigCommand(
            command_type="set",
            path=path,
            value=value,
            original=original,
        )

    def _parse_delete_command(self, match: re.Match[str], original: str) -> ConfigCommand:
        """Parse delete command"""
        path_str = match.group(1).strip()
        path = self._tokenize_path(path_str)

        return ConfigCommand(
            command_type="delete",
            path=path,
            original=original,
        )

    def _parse_comment_command(self, match: re.Match[str], original: str) -> ConfigCommand:
        """Parse comment command"""
        path_str = match.group(1).strip()
        comment = match.group(2).strip()
        path = self._tokenize_path(path_str)

        return ConfigCommand(
            command_type="comment",
            path=path,
            value=comment,
            original=original,
        )

    def _parse_rename_command(self, match: re.Match[str], original: str) -> ConfigCommand:
        """Parse rename command"""
        old_path_str = match.group(1).strip()
        new_name = match.group(2).strip()
        path = self._tokenize_path(old_path_str)

        return ConfigCommand(
            command_type="rename",
            path=path,
            value=new_name,
            original=original,
        )

    def _parse_edit_command(self, match: re.Match[str], original: str) -> ConfigCommand:
        """Parse edit command (config mode change)"""
        path_str = match.group(1).strip()
        path = self._tokenize_path(path_str)

        return ConfigCommand(
            command_type="edit",
            path=path,
            original=original,
        )

    def _tokenize_path(self, path_str: str) -> list[str]:
        """Tokenize path string into components

        Args:
            path_str: Path string (e.g., "interface eth0 address")

        Returns:
            List of path components
        """
        # Split on spaces, respecting quoted strings
        tokens = []
        current_token = ""
        in_quotes = False
        quote_char = ""

        for char in path_str:
            if char in ('"', "'") and (not in_quotes or char == quote_char):
                in_quotes = not in_quotes
                quote_char = char
                continue

            if char.isspace() and not in_quotes:
                if current_token:
                    tokens.append(current_token)
                    current_token = ""
                continue

            current_token += char

        if current_token:
            tokens.append(current_token)

        return tokens

    def _split_path_and_value(self, path_str: str) -> tuple[list[str], str | None]:
        """Split path string into path and value

        Args:
            path_str: Path string possibly containing value

        Returns:
            Tuple of (path, value)
        """
        match = self.VALUE_PATTERN.match(path_str)
        if match:
            value = match.group(2) if match else None
            path = [match.group(1)] if match else []
            return path, value

        # Try to split on last space
        parts = path_str.rsplit(" ", 1)
        if len(parts) == 2:
            return parts[0].split(), parts[1]

        return path_str.split(), None

    def parse_config(self, config_text: str) -> ConfigNode:
        """Parse complete configuration text

        Args:
            config_text: Multi-line configuration text

        Returns:
            ConfigNode root of configuration tree

        """
        self.config_root = ConfigNode()

        for line in config_text.split("\n"):
            command = self.parse_line(line)

            if command:
                self._apply_command(command)

        return self.config_root

    def _apply_command(self, command: ConfigCommand) -> None:
        """Apply a configuration command to the tree

        Args:
            command: Configuration command to apply
        """
        node = self.config_root

        # Navigate to parent node
        for i, part in enumerate(command.path[:-1]):
            node = node.add_child(part)

        # Apply command to final part
        if command.command_type == "set":
            if command.path:
                final_part = command.path[-1]
                child = node.add_child(final_part)
                if command.value is not None:
                    child.set_value(command.value)

        elif command.command_type == "delete":
            if command.path:
                final_part = command.path[-1]
                if final_part in node.children:
                    node.children[final_part].deleted = True

        elif command.command_type == "comment":
            if command.path:
                final_part = command.path[-1]
                if final_part in node.children:
                    node.children[final_part].comment = command.value

    def calculate_diff(self, old_config: ConfigNode, new_config: ConfigNode) -> ConfigDiff:
        """Calculate differences between two configurations

        Args:
            old_config: Old configuration tree
            new_config: New configuration tree

        Returns:
            ConfigDiff with differences
        """
        diff = ConfigDiff()

        old_flat = old_config.flatten()
        new_flat = new_config.flatten()

        all_keys = set(old_flat.keys()) | set(new_flat.keys())

        for key in all_keys:
            old_value = old_flat.get(key)
            new_value = new_flat.get(key)

            if old_value is None and new_value is not None:
                diff.added[key] = new_value
            elif old_value is not None and new_value is None:
                diff.removed[key] = old_value
            elif old_value != new_value:
                diff.modified[key] = (old_value, new_value)

        return diff

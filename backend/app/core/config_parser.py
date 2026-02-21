"""VyOS Configuration Parser - Configuration Tree Data Structure"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass
class ConfigNode:
    """Configuration tree node representing VyOS configuration hierarchy"""

    path: list[str] = field(default_factory=list)
    value: Any | None = None
    children: dict[str, ConfigNode] = field(default_factory=dict)
    deleted: bool = False
    comment: str | None = None

    def __repr__(self) -> str:
        """String representation"""
        if self.value is not None:
            return f"ConfigNode(path={'.'.join(self.path)}, value={self.value})"
        return f"ConfigNode(path={'.'.join(self.path)}, children={len(self.children)})"

    def get_child(self, *path_parts: str) -> ConfigNode | None:
        """Get child node by path

        Args:
            *path_parts: Path components

        Returns:
            ConfigNode or None if not found
        """
        if not path_parts:
            return self

        first, *rest = path_parts

        if first not in self.children:
            return None

        return self.children[first].get_child(*rest)

    def add_child(self, name: str) -> ConfigNode:
        """Add a child node

        Args:
            name: Child node name

        Returns:
            New or existing child node
        """
        if name not in self.children:
            self.children[name] = ConfigNode(path=self.path + [name])

        return self.children[name]

    def set_value(self, value: Any) -> None:
        """Set node value and clear children

        Args:
            value: Node value
        """
        self.value = value
        self.children.clear()

    def flatten(self) -> dict[str, Any]:
        """Flatten configuration tree to dictionary

        Returns:
            Flattened configuration dictionary
        """
        result: dict[str, Any] = {}

        def _flatten(node: ConfigNode, prefix: str = ""):
            for name, child in node.children.items():
                full_path = f"{prefix}{name}" if prefix else name

                if child.value is not None:
                    result[full_path] = child.value
                elif child.children:
                    _flatten(child, f"{full_path}.")

        _flatten(self)
        return result

    def to_dict(self) -> dict[str, Any]:
        """Convert configuration tree to nested dictionary

        Returns:
            Nested dictionary representation
        """
        result: dict[str, Any] = {}

        for name, child in self.children.items():
            if child.deleted:
                continue

            if child.value is not None:
                result[name] = child.value
            elif child.children:
                result[name] = child.to_dict()

        return result

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ConfigNode:
        """Create configuration tree from nested dictionary

        Args:
            data: Nested dictionary

        Returns:
            ConfigNode root
        """
        root = cls()

        def _populate(node: ConfigNode, data: dict[str, Any]):
            for key, value in data.items():
                child = node.add_child(key)

                if isinstance(value, dict):
                    _populate(child, value)
                else:
                    child.set_value(value)

        _populate(root, data)
        return root


@dataclass
class ConfigDiff:
    """Configuration difference between two states"""

    added: dict[str, Any] = field(default_factory=dict)
    removed: dict[str, Any] = field(default_factory=dict)
    modified: dict[str, tuple[Any, Any]] = field(default_factory=dict)

    def is_empty(self) -> bool:
        """Check if diff is empty"""
        return not self.added and not self.removed and not self.modified

    def __repr__(self) -> str:
        """String representation"""
        parts = []

        if self.added:
            parts.append(f"Added: {len(self.added)} items")
        if self.removed:
            parts.append(f"Removed: {len(self.removed)} items")
        if self.modified:
            parts.append(f"Modified: {len(self.modified)} items")

        return f"ConfigDiff({', '.join(parts)})"

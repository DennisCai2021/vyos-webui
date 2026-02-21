"""VyOS Configuration Rollback Mechanism"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import Any

from app.core.config_parser import ConfigNode


@dataclass
class ConfigSnapshot:
    """Configuration snapshot with metadata"""

    id: str
    timestamp: datetime
    description: str | None = None
    config_hash: str = ""
    config_data: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert snapshot to dictionary"""
        return {
            "id": self.id,
            "timestamp": self.timestamp.isoformat(),
            "description": self.description,
            "config_hash": self.config_hash,
            "config_data": self.config_data,
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> ConfigSnapshot:
        """Create snapshot from dictionary"""
        return cls(
            id=data["id"],
            timestamp=datetime.fromisoformat(data["timestamp"]),
            description=data.get("description"),
            config_hash=data.get("config_hash", ""),
            config_data=data.get("config_data", {}),
        )


class ConfigRollbackManager:
    """Manager for configuration snapshots and rollback"""

    def __init__(self, storage_dir: str = "./snapshots", max_snapshots: int = 10):
        """Initialize rollback manager

        Args:
            storage_dir: Directory to store snapshots
            max_snapshots: Maximum number of snapshots to keep
        """
        self.storage_dir = Path(storage_dir)
        self.storage_dir.mkdir(parents=True, exist_ok=True)
        self.max_snapshots = max_snapshots
        self.snapshot_index_file = self.storage_dir / "index.json"
        self.snapshots: list[ConfigSnapshot] = []

        self._load_index()

    def create_snapshot(self, config: ConfigNode, description: str | None = None) -> ConfigSnapshot:
        """Create a configuration snapshot

        Args:
            config: Configuration tree to snapshot
            description: Optional description

        Returns:
            ConfigSnapshot
        """
        snapshot_id = self._generate_snapshot_id()
        timestamp = datetime.utcnow()
        config_data = config.to_dict()
        config_hash = self._calculate_hash(config_data)

        snapshot = ConfigSnapshot(
            id=snapshot_id,
            timestamp=timestamp,
            description=description,
            config_hash=config_hash,
            config_data=config_data,
        )

        # Save snapshot
        self._save_snapshot(snapshot)

        # Add to index
        self.snapshots.append(snapshot)
        self._prune_old_snapshots()
        self._save_index()

        return snapshot

    def restore_snapshot(self, snapshot_id: str) -> ConfigNode | None:
        """Restore configuration from snapshot

        Args:
            snapshot_id: Snapshot ID to restore

        Returns:
            ConfigNode or None if not found
        """
        snapshot = self._find_snapshot(snapshot_id)

        if not snapshot:
            return None

        return ConfigNode.from_dict(snapshot.config_data)  # type: ignore

    def get_snapshot(self, snapshot_id: str) -> ConfigSnapshot | None:
        """Get snapshot by ID

        Args:
            snapshot_id: Snapshot ID

        Returns:
            ConfigSnapshot or None if not found
        """
        return self._find_snapshot(snapshot_id)

    def list_snapshots(self, limit: int | None = None) -> list[ConfigSnapshot]:
        """List all snapshots

        Args:
            limit: Maximum number to return (most recent first)

        Returns:
            List of ConfigSnapshot
        """
        snapshots = sorted(self.snapshots, key=lambda s: s.timestamp, reverse=True)

        if limit:
            return snapshots[:limit]

        return snapshots

    def delete_snapshot(self, snapshot_id: str) -> bool:
        """Delete a snapshot

        Args:
            snapshot_id: Snapshot ID to delete

        Returns:
            True if deleted, False if not found
        """
        snapshot = self._find_snapshot(snapshot_id)

        if not snapshot:
            return False

        # Delete snapshot file
        snapshot_file = self.storage_dir / f"{snapshot_id}.json"
        if snapshot_file.exists():
            snapshot_file.unlink()

        # Remove from index
        self.snapshots = [s for s in self.snapshots if s.id != snapshot_id]
        self._save_index()

        return True

    def compare_snapshots(self, snapshot_id1: str, snapshot_id2: str) -> dict[str, Any] | None:
        """Compare two snapshots

        Args:
            snapshot_id1: First snapshot ID
            snapshot_id2: Second snapshot ID

        Returns:
            Comparison result or None if snapshots not found
        """
        snapshot1 = self._find_snapshot(snapshot_id1)
        snapshot2 = self._find_snapshot(snapshot_id2)

        if not snapshot1 or not snapshot2:
            return None

        config1 = ConfigNode.from_dict(snapshot1.config_data)
        config2 = ConfigNode.from_dict(snapshot2.config_data)

        from app.core.vyos_syntax import VyOSSyntaxParser

        parser = VyOSSyntaxParser()
        diff = parser.calculate_diff(config1, config2)

        return {
            "snapshot1": snapshot1.to_dict(),
            "snapshot2": snapshot2.to_dict(),
            "diff": {
                "added": diff.added,
                "removed": diff.removed,
                "modified": diff.modified,
            },
        }

    def _generate_snapshot_id(self) -> str:
        """Generate unique snapshot ID"""
        timestamp = datetime.utcnow().strftime("%Y%m%d%H%M%S")
        random_suffix = hashlib.md5(timestamp.encode()).hexdigest()[:6]
        return f"snapshot_{timestamp}_{random_suffix}"

    def _calculate_hash(self, data: dict[str, Any]) -> str:
        """Calculate hash of configuration data

        Args:
            data: Configuration data

        Returns:
            SHA256 hash
        """
        json_str = json.dumps(data, sort_keys=True)
        return hashlib.sha256(json_str.encode()).hexdigest()[:16]

    def _find_snapshot(self, snapshot_id: str) -> ConfigSnapshot | None:
        """Find snapshot by ID

        Args:
            snapshot_id: Snapshot ID

        Returns:
            ConfigSnapshot or None
        """
        for snapshot in self.snapshots:
            if snapshot.id == snapshot_id:
                return snapshot
        return None

    def _save_snapshot(self, snapshot: ConfigSnapshot) -> None:
        """Save snapshot to file

        Args:
            snapshot: Snapshot to save
        """
        snapshot_file = self.storage_dir / f"{snapshot.id}.json"

        with snapshot_file.open("w") as f:
            json.dump(snapshot.to_dict(), f, indent=2)

    def _load_index(self) -> None:
        """Load snapshot index from file"""
        if not self.snapshot_index_file.exists():
            return

        try:
            with self.snapshot_index_file.open("r") as f:
                data = json.load(f)

            for snapshot_data in data.get("snapshots", []):
                snapshot = ConfigSnapshot.from_dict(snapshot_data)
                self.snapshots.append(snapshot)

        except (json.JSONDecodeError, KeyError) as e:
            # Corrupt index, start fresh
            self.snapshots = []

    def _save_index(self) -> None:
        """Save snapshot index to file"""
        data = {
            "snapshots": [s.to_dict() for s in self.snapshots],
        }

        with self.snapshot_index_file.open("w") as f:
            json.dump(data, f, indent=2)

    def _prune_old_snapshots(self) -> None:
        """Remove old snapshots if exceeding max"""
        if len(self.snapshots) <= self.max_snapshots:
            return

        # Sort by timestamp and remove oldest
        self.snapshots.sort(key=lambda s: s.timestamp, reverse=True)

        # Keep only max_snapshots
        to_remove = self.snapshots[self.max_snapshots :]

        for snapshot in to_remove:
            snapshot_file = self.storage_dir / f"{snapshot.id}.json"
            if snapshot_file.exists():
                snapshot_file.unlink()

        self.snapshots = self.snapshots[: self.max_snapshots]

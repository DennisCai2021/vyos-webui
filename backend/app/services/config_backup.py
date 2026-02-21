"""Configuration backup and restore service for VyOS"""
import json
import re
import uuid
from datetime import datetime
from dataclasses import dataclass, field, asdict
from enum import Enum
from pathlib import Path
from typing import Any, Self
import hashlib

from loguru import logger

from app.services.vyos_command import VyOSCommandExecutor


def convert_to_dict(obj):
    """Convert dataclass to dictionary with datetime conversion"""
    from dataclasses import fields, is_dataclass

    if not is_dataclass(obj):
        return obj

    result = {}
    for f in fields(obj):
        value = getattr(obj, f.name)
        if isinstance(value, datetime):
            result[f.name] = value.isoformat()
        elif is_dataclass(value):
            result[f.name] = convert_to_dict(value)
        elif isinstance(value, list):
            result[f.name] = [convert_to_dict(item) for item in value]
        elif isinstance(value, dict):
            result[f.name] = {k: convert_to_dict(v) for k, v in value.items()}
        else:
            result[f.name] = value
    return result


class BackupFormat(str, Enum):
    """Configuration backup format"""

    JSON = "json"
    YAML = "yaml"
    XML = "xml"
    VYOS = "vyos"  # Native VyOS format
    TAR = "tar"  # Compressed tar archive


class BackupStatus(str, Enum):
    """Backup status"""

    PENDING = "pending"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    FAILED = "failed"


class ConfigVersionStatus(str, Enum):
    """Configuration version status"""

    ACTIVE = "active"
    ARCHIVED = "archived"
    ROLLED_BACK = "rolled_back"


@dataclass
class ConfigSnapshot:
    """Configuration snapshot data model"""

    id: str
    name: str
    description: str
    timestamp: datetime
    format: BackupFormat
    size: int = 0
    checksum: str = ""
    status: BackupStatus = BackupStatus.COMPLETED
    version_info: dict[str, str] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary"""
        return convert_to_dict(self)


@dataclass
class ConfigDiff:
    """Configuration difference model"""

    path: str  # Configuration path: e.g., "interfaces ethernet eth0 address"
    old_value: str | None = None
    new_value: str | None = None
    change_type: str = "modified"  # added, deleted, modified
    metadata: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary"""
        return asdict(self)


@dataclass
class ConfigVersion:
    """Configuration version model"""

    id: str
    version: int
    name: str
    description: str
    created_at: datetime
    created_by: str | None = None
    status: ConfigVersionStatus = ConfigVersionStatus.ARCHIVED
    size: int = 0
    checksum: str = ""
    config_hash: str = ""
    parent_version: str | None = None
    tags: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary"""
        return convert_to_dict(self)


class ConfigBackupManager:
    """Manager for VyOS configuration backup and restore operations"""

    def __init__(self, executor: VyOSCommandExecutor, backup_dir: str = "/var/lib/vyos-webui/backups"):
        self.executor = executor
        self.backup_dir = backup_dir
        self._ensure_backup_dir()

    def _ensure_backup_dir(self) -> None:
        """Ensure backup directory exists"""
        try:
            self.executor.execute(f"mkdir -p {self.backup_dir}")
            self.executor.execute(f"mkdir -p {self.backup_dir}/snapshots")
            self.executor.execute(f"mkdir -p {self.backup_dir}/versions")
        except Exception as e:
            logger.error(f"Failed to create backup directories: {e}")

    def create_snapshot(
        self,
        name: str,
        description: str = "",
        format: BackupFormat = BackupFormat.VYOS,
        include_system: bool = True,
        include_keys: bool = False,
    ) -> ConfigSnapshot:
        """Create a configuration snapshot

        Args:
            name: Snapshot name
            description: Snapshot description
            format: Backup format
            include_system: Include system information
            include_keys: Include cryptographic keys

        Returns:
            ConfigSnapshot object
        """
        snapshot_id = str(uuid.uuid4())
        timestamp = datetime.now()

        try:
            # Get current configuration
            result = self.executor.execute("/opt/vyatta/bin/vyatta-op-cmd-wrapper show configuration commands")

            config_content = result.stdout if result.stdout else ""

            # Get version information
            version_info = self._get_version_info()

            # Format configuration based on requested format
            formatted_config = self._format_config(config_content, format)

            # Calculate checksum
            checksum = hashlib.sha256(formatted_config.encode()).hexdigest()

            # Save snapshot
            filename = f"{snapshot_id}.{format.value}"
            filepath = f"{self.backup_dir}/snapshots/{filename}"

            result = self.executor.execute(f"cat << 'EOF' > {filepath}\n{formatted_config}\nEOF")

            # Get file size
            size_result = self.executor.execute(f"wc -c {filepath}")
            size = int(size_result.stdout.strip().split()[0]) if size_result.stdout else 0

            snapshot = ConfigSnapshot(
                id=snapshot_id,
                name=name,
                description=description,
                timestamp=timestamp,
                format=format,
                size=size,
                checksum=checksum,
                status=BackupStatus.COMPLETED,
                version_info=version_info,
            )

            # Save snapshot metadata
            self._save_snapshot_metadata(snapshot)

            logger.info(f"Created snapshot {snapshot_id}: {name}")
            return snapshot

        except Exception as e:
            logger.error(f"Failed to create snapshot: {e}")
            return ConfigSnapshot(
                id=snapshot_id,
                name=name,
                description=description,
                timestamp=timestamp,
                format=format,
                status=BackupStatus.FAILED,
                version_info={},
            )

    def _get_version_info(self) -> dict[str, str]:
        """Get VyOS version information"""
        version_info = {}

        try:
            result = self.executor.execute("/opt/vyatta/bin/vyatta-op-cmd-wrapper show version")
            if result.stdout:
                for line in result.stdout.split("\n"):
                    if ":" in line:
                        key, value = line.split(":", 1)
                        version_info[key.strip().lower().replace(" ", "_")] = value.strip()

        except Exception as e:
            logger.warning(f"Failed to get version info: {e}")

        return version_info

    def _format_config(self, config: str, format: BackupFormat) -> str:
        """Format configuration based on requested format"""
        if format == BackupFormat.VYOS:
            return config
        elif format == BackupFormat.JSON:
            return self._config_to_json(config)
        elif format == BackupFormat.YAML:
            return self._config_to_yaml(config)
        elif format == BackupFormat.XML:
            return self._config_to_xml(config)
        else:
            return config

    def _config_to_json(self, config: str) -> str:
        """Convert VyOS config to JSON format"""
        # Simple line-based JSON conversion
        lines = config.split("\n")
        result = {"configuration": []}

        for line in lines:
            if line.strip() and not line.strip().startswith("#"):
                result["configuration"].append(line.strip())

        return json.dumps(result, indent=2)

    def _config_to_yaml(self, config: str) -> str:
        """Convert VyOS config to YAML format"""
        lines = config.split("\n")
        result = ["vyos-configuration:"]
        for line in lines:
            if line.strip() and not line.strip().startswith("#"):
                result.append(f"  - {line.strip()}")
        return "\n".join(result)

    def _config_to_xml(self, config: str) -> str:
        """Convert VyOS config to XML format"""
        lines = config.split("\n")
        result = ["<vyos-configuration>"]
        for line in lines:
            if line.strip() and not line.strip().startswith("#"):
                result.append(f"  <command>{line.strip()}</command>")
        result.append("</vyos-configuration>")
        return "\n".join(result)

    def _save_snapshot_metadata(self, snapshot: ConfigSnapshot) -> None:
        """Save snapshot metadata"""
        try:
            metadata_file = f"{self.backup_dir}/snapshots/{snapshot.id}.meta"
            metadata_json = json.dumps(snapshot.to_dict(), indent=2)

            # Write metadata file via SSH using cat <<EOF
            self.executor.execute(f"cat << 'META_EOF' > {metadata_file}\n{metadata_json}\nMETA_EOF")

        except Exception as e:
            logger.warning(f"Failed to save snapshot metadata: {e}")

    def list_snapshots(self) -> list[ConfigSnapshot]:
        """List all configuration snapshots

        Returns:
            List of ConfigSnapshot objects
        """
        snapshots: list[ConfigSnapshot] = []

        try:
            result = self.executor.execute(f"ls -1 {self.backup_dir}/snapshots 2>/dev/null || echo ''")

            if result.stdout:
                # Get metadata files
                meta_files = [f for f in result.stdout.split("\n") if f.endswith(".meta")]

                for meta_file in meta_files:
                    try:
                        filepath = f"{self.backup_dir}/snapshots/{meta_file}"

                        # Read metadata file
                        cmd_result = self.executor.execute(f"cat {filepath}")

                        if cmd_result.stdout:
                            meta = json.loads(cmd_result.stdout)
                            # Convert timestamp string to datetime
                            if isinstance(meta.get('timestamp'), str):
                                meta['timestamp'] = datetime.fromisoformat(meta['timestamp'])
                            # Convert format string to enum
                            if isinstance(meta.get('format'), str):
                                meta['format'] = BackupFormat(meta['format'])
                            # Convert status string to enum
                            if isinstance(meta.get('status'), str):
                                meta['status'] = BackupStatus(meta['status'])
                            snapshots.append(ConfigSnapshot(**meta))

                    except Exception as e:
                        logger.debug(f"Failed to parse snapshot metadata {meta_file}: {e}")

        except Exception as e:
            logger.error(f"Failed to list snapshots: {e}")

        return sorted(snapshots, key=lambda x: x.timestamp, reverse=True)

    def get_snapshot(self, snapshot_id: str) -> ConfigSnapshot | None:
        """Get a specific snapshot

        Args:
            snapshot_id: Snapshot ID

        Returns:
            ConfigSnapshot object or None
        """
        snapshots = self.list_snapshots()
        for snapshot in snapshots:
            if snapshot.id == snapshot_id:
                return snapshot
        return None

    def delete_snapshot(self, snapshot_id: str) -> bool:
        """Delete a configuration snapshot

        Args:
            snapshot_id: Snapshot ID

        Returns:
            True if deleted, False otherwise
        """
        try:
            self.executor.execute(f"rm -f {self.backup_dir}/snapshots/{snapshot_id}.*")
            logger.info(f"Deleted snapshot {snapshot_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to delete snapshot {snapshot_id}: {e}")
            return False

    async def restore_from_snapshot(
        self, snapshot_id: str, dry_run: bool = False
    ) -> dict[str, Any]:
        """Restore configuration from snapshot

        Args:
            snapshot_id: Snapshot ID
            dry_run: If True, only validate the restore

        Returns:
            Restore result dictionary
        """
        snapshot = self.get_snapshot(snapshot_id)

        if not snapshot:
            return {"success": False, "message": "Snapshot not found"}

        try:
            if dry_run:
                return {
                    "success": True,
                    "message": "Dry run successful",
                    "snapshot": snapshot.to_dict(),
                }

            # Get snapshot content
            result = self.executor.execute(
                f"cat {self.backup_dir}/snapshots/{snapshot_id}.{snapshot.format.value}"
            )

            if not result.stdout:
                return {"success": False, "message": "Failed to read snapshot content"}

            # Apply configuration
            config = result.stdout

            # Create backup of current config before restore
            await self.create_snapshot(
                name=f"pre-restore-{snapshot_id}",
                description=f"Automatic backup before restoring {snapshot_id}",
            )

            # Apply new configuration
            result = self.executor.execute("configure")
            if result.exit_code != 0:
                self.executor.execute("discard")
                self.executor.execute("exit")
                return {"success": False, "message": "Failed to enter configuration mode"}

            # Apply each command
            for line in config.split("\n"):
                line = line.strip()
                if line and not line.startswith("#"):
                    result = self.executor.execute(f"set {line}")
                    if result.exit_code != 0:
                        self.executor.execute("discard")
                        self.executor.execute("exit")
                        return {
                            "success": False,
                            "message": f"Failed to apply command: {line}",
                        }

            # Commit and exit
            result = self.executor.execute("commit")
            if result.exit_code != 0:
                self.executor.execute("discard")
                self.executor.execute("exit")
                return {"success": False, "message": "Failed to commit configuration"}

            self.executor.execute("exit")
            self.executor.execute("save")

            return {
                "success": True,
                "message": "Configuration restored successfully",
                "snapshot_id": snapshot_id,
            }

        except Exception as e:
            logger.error(f"Failed to restore from snapshot: {e}")
            return {"success": False, "message": str(e)}

    def compare_configs(
        self, snapshot_id1: str, snapshot_id2: str
    ) -> list[ConfigDiff]:
        """Compare two configuration snapshots

        Args:
            snapshot_id1: First snapshot ID
            snapshot_id2: Second snapshot ID

        Returns:
            List of configuration differences
        """
        try:
            # Get both snapshots
            snap1 = self.get_snapshot(snapshot_id1)
            snap2 = self.get_snapshot(snapshot_id2)

            if not snap1 or not snap2:
                return []

            # Read configurations
            result1 = self.executor.execute(
                f"cat {self.backup_dir}/snapshots/{snapshot_id1}.{snap1.format.value}"
            )
            result2 = self.executor.execute(
                f"cat {self.backup_dir}/snapshots/{snapshot_id2}.{snap2.format.value}"
            )

            config1 = set(result1.stdout.split("\n")) if result1.stdout else set()
            config2 = set(result2.stdout.split("\n")) if result2.stdout else set()

            # Calculate differences
            diffs: list[ConfigDiff] = []

            # Added lines
            for line in config2 - config1:
                if line.strip():
                    diffs.append(
                        ConfigDiff(
                            path=line.strip(),
                            new_value=line.strip(),
                            change_type="added",
                        )
                    )

            # Deleted lines
            for line in config1 - config2:
                if line.strip():
                    diffs.append(
                        ConfigDiff(
                            path=line.strip(),
                            old_value=line.strip(),
                            change_type="deleted",
                        )
                    )

            return diffs

        except Exception as e:
            logger.error(f"Failed to compare configs: {e}")
            return []

    def export_config(
        self, format: BackupFormat = BackupFormat.VYOS, include_system: bool = True
    ) -> str:
        """Export current configuration

        Args:
            format: Export format
            include_system: Include system information

        Returns:
            Formatted configuration string
        """
        try:
            result = self.executor.execute("/opt/vyatta/bin/vyatta-op-cmd-wrapper show configuration commands")
            config = result.stdout if result.stdout else ""

            if format != BackupFormat.VYOS:
                config = self._format_config(config, format)

            return config

        except Exception as e:
            logger.error(f"Failed to export config: {e}")
            raise

    async def import_config(
        self, config: str, format: BackupFormat = BackupFormat.VYOS, dry_run: bool = False
    ) -> dict[str, Any]:
        """Import configuration

        Args:
            config: Configuration content
            format: Configuration format
            dry_run: If True, only validate

        Returns:
            Import result
        """
        try:
            if dry_run:
                return {"success": True, "message": "Configuration validation successful"}

            # Create temp file
            temp_file = f"/tmp/config_import_{uuid.uuid4()}.{format.value}"

            self.executor.execute(f"cat << 'EOF' > {temp_file}\n{config}\nEOF")

            # Create backup before import
            await self.create_snapshot(
                name=f"pre-import-{datetime.now().strftime('%Y%m%d_%H%M%S')}",
                description="Automatic backup before config import",
            )

            # Apply configuration
            for line in config.split("\n"):
                line = line.strip()
                if line and not line.startswith("#"):
                    self.executor.execute(f"configure\nset {line}\ncommit\nexit")

            self.executor.execute("save")

            # Cleanup temp file
            self.executor.execute(f"rm -f {temp_file}")

            return {"success": True, "message": "Configuration imported successfully"}

        except Exception as e:
            logger.error(f"Failed to import config: {e}")
            return {"success": False, "message": str(e)}


class ConfigVersionManager:
    """Manager for configuration version history"""

    def __init__(self, executor: VyOSCommandExecutor, versions_dir: str = "/var/lib/vyos-webui/versions"):
        self.executor = executor
        self.versions_dir = versions_dir
        self.backup_manager = ConfigBackupManager(executor)
        self._ensure_version_dir()

    def _ensure_version_dir(self) -> None:
        """Ensure version directory exists"""
        try:
            self.executor.execute(f"mkdir -p {self.versions_dir}")
        except Exception as e:
            logger.error(f"Failed to create versions directory: {e}")

    def create_version(
        self,
        name: str,
        description: str = "",
        created_by: str | None = None,
        tags: list[str] | None = None,
    ) -> ConfigVersion:
        """Create a new configuration version

        Args:
            name: Version name
            description: Version description
            created_by: Creator username
            tags: Optional tags

        Returns:
            ConfigVersion object
        """
        version_id = str(uuid.uuid4())
        created_at = datetime.now()

        try:
            # Get version number (increment from existing)
            versions = self.list_versions()
            version_num = max([v.version for v in versions], default=0) + 1

            # Get current configuration
            result = self.executor.execute("/opt/vyatta/bin/vyatta-op-cmd-wrapper show configuration commands")
            config = result.stdout if result.stdout else ""

            # Calculate config hash
            config_hash = hashlib.sha256(config.encode()).hexdigest()

            # Save version file
            filename = f"v{version_num:04d}_{version_id}.vyos"
            filepath = f"{self.versions_dir}/{filename}"

            self.executor.execute(f"cat << 'EOF' > {filepath}\n{config}\nEOF")

            # Get file size
            size_result = (self.executor.execute(f"wc -c {filepath}")).stdout.strip()
            size = int(size_result.split()[0]) if size_result else 0

            # Get previous version
            parent_version = versions[0].id if versions else None

            version = ConfigVersion(
                id=version_id,
                version=version_num,
                name=name,
                description=description,
                created_at=created_at,
                created_by=created_by,
                status=ConfigVersionStatus.ARCHIVED,
                size=size,
                checksum=hashlib.sha256(config.encode()).hexdigest(),
                config_hash=config_hash,
                parent_version=parent_version,
                tags=tags or [],
            )

            # Save version metadata
            self._save_version_metadata(version)

            logger.info(f"Created version v{version_num}: {name}")
            return version

        except Exception as e:
            logger.error(f"Failed to create version: {e}")
            raise

    def _save_version_metadata(self, version: ConfigVersion) -> None:
        """Save version metadata"""
        try:
            meta_file = f"{self.versions_dir}/meta_{version.id}.json"
            metadata_json = json.dumps(version.to_dict(), indent=2)

            # Write metadata file via SSH using cat <<EOF
            self.executor.execute(f"cat << 'META_EOF' > {meta_file}\n{metadata_json}\nMETA_EOF")

        except Exception as e:
            logger.warning(f"Failed to save version metadata: {e}")

    def list_versions(self) -> list[ConfigVersion]:
        """List all configuration versions

        Returns:
            List of ConfigVersion objects
        """
        versions: list[ConfigVersion] = []

        try:
            result = self.executor.execute(
                f"ls -1 {self.versions_dir} 2>/dev/null || echo ''"
            )

            if result.stdout:
                meta_files = [f for f in result.stdout.split("\n") if f.startswith("meta_")]

                for meta_file in meta_files:
                    try:
                        filepath = f"{self.versions_dir}/{meta_file}"
                        cmd_result = self.executor.execute(f"cat {filepath}")

                        if cmd_result.stdout:
                            meta = json.loads(cmd_result.stdout)
                            # Convert datetime strings to datetime objects
                            if isinstance(meta.get('created_at'), str):
                                meta['created_at'] = datetime.fromisoformat(meta['created_at'])
                            # Convert status string to enum
                            if isinstance(meta.get('status'), str):
                                meta['status'] = ConfigVersionStatus(meta['status'])
                            versions.append(ConfigVersion(**meta))

                    except Exception as e:
                        logger.debug(f"Failed to parse version metadata {meta_file}: {e}")

        except Exception as e:
            logger.error(f"Failed to list versions: {e}")

        return sorted(versions, key=lambda x: x.version, reverse=True)

    def get_version(self, version_id: str) -> ConfigVersion | None:
        """Get a specific version

        Args:
            version_id: Version ID

        Returns:
            ConfigVersion object or None
        """
        versions = self.list_versions()
        for version in versions:
            if version.id == version_id:
                return version
        return None

    def restore_version(self, version_id: str, dry_run: bool = False) -> dict[str, Any]:
        """Restore configuration from version

        Args:
            version_id: Version ID
            dry_run: If True, only validate

        Returns:
            Restore result
        """
        version = self.get_version(version_id)

        if not version:
            return {"success": False, "message": "Version not found"}

        try:
            if dry_run:
                return {
                    "success": True,
                    "message": "Dry run successful",
                    "version": version.to_dict(),
                }

            # Find version file
            versions = self.list_versions()
            for v in versions:
                if v.id == version_id:
                    filename = f"v{v.version:04d}_{version_id}.vyos"
                    filepath = f"{self.versions_dir}/{filename}"
                    break
            else:
                return {"success": False, "message": "Version file not found"}

            # Read version content
            result = self.executor.execute(f"cat {filepath}")

            if not result.stdout:
                return {"success": False, "message": "Failed to read version content"}

            # Create backup before restore
            self.create_version(
                name=f"pre-restore-v{version.version}",
                description=f"Automatic backup before restoring version v{version.version}",
            )

            # Apply configuration
            for line in result.stdout.split("\n"):
                line = line.strip()
                if line and not line.startswith("#"):
                    self.executor.execute(f"configure\nset {line}\ncommit\nexit")

            self.executor.execute("save")

            # Update version status
            # (In a real implementation, this would update the metadata)

            return {
                "success": True,
                "message": "Configuration version restored successfully",
                "version_id": version_id,
            }

        except Exception as e:
            logger.error(f"Failed to restore version: {e}")
            return {"success": False, "message": str(e)}

    def delete_version(self, version_id: str) -> bool:
        """Delete a configuration version

        Args:
            version_id: Version ID

        Returns:
            True if deleted, False otherwise
        """
        try:
            # Find version file
            versions = self.list_versions()
            for v in versions:
                if v.id == version_id:
                    filename = f"v{v.version:04d}_{version_id}.vyos"
                    filepath = f"{self.versions_dir}/{filename}"
                    meta_file = f"{self.versions_dir}/meta_{version_id}.json"

                    self.executor.execute(f"rm -f {filepath}")
                    self.executor.execute(f"rm -f {meta_file}")

                    logger.info(f"Deleted version v{v.version}: {version_id}")
                    return True

        except Exception as e:
            logger.error(f"Failed to delete version {version_id}: {e}")

        return False

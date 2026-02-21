"""Configuration backup and restore API endpoints"""
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.services.config_backup import (
    BackupFormat,
    BackupStatus,
    ConfigBackupManager,
    ConfigDiff,
    ConfigSnapshot,
    ConfigVersion,
    ConfigVersionManager,
)
from app.services.vyos_command import VyOSCommandExecutor
from app.services.vyos_ssh import VyOSSSHClient, VyOSSSHConfig
from app.core.config import settings

router = APIRouter(prefix="/backup", tags=["backup"])


# Request/Response Models
class SnapshotRequest(BaseModel):
    """Configuration snapshot request model"""

    name: str = Field(..., description="Snapshot name")
    description: str = Field(default="", description="Snapshot description")
    format: str = Field(default="vyos", description="Backup format: json, yaml, xml, vyos")
    include_system: bool = Field(default=True, description="Include system information")
    include_keys: bool = Field(default=False, description="Include cryptographic keys")

    @classmethod
    def validate_format(cls, v: str) -> str:
        valid_formats = ["json", "yaml", "xml", "vyos"]
        if v.lower() not in valid_formats:
            raise ValueError(f"format must be one of {valid_formats}")
        return v.lower()


class SnapshotResponse(BaseModel):
    """Configuration snapshot response model"""

    id: str
    name: str
    description: str
    timestamp: str
    format: str
    size: int
    checksum: str
    status: str
    version_info: dict[str, str]


class ConfigDiffResponse(BaseModel):
    """Configuration difference response model"""

    path: str
    old_value: str | None = None
    new_value: str | None = None
    change_type: str
    metadata: dict[str, Any] = []


class VersionRequest(BaseModel):
    """Configuration version request model"""

    name: str = Field(..., description="Version name")
    description: str = Field(default="", description="Version description")
    tags: list[str] = Field(default_factory=list, description="Version tags")


class VersionResponse(BaseModel):
    """Configuration version response model"""

    id: str
    version: int
    name: str
    description: str
    created_at: str
    created_by: str | None = None
    status: str
    size: int
    checksum: str
    config_hash: str
    parent_version: str | None = None
    tags: list[str] = []


class RestoreRequest(BaseModel):
    """Restore request model"""



    dry_run: bool = Field(default=False, description="Validate without applying")


class ExportResponse(BaseModel):
    """Configuration export response model"""

    format: str
    content: str
    timestamp: str
    checksum: str


class ImportRequest(BaseModel):
    """Configuration import request model"""

    config: str = Field(..., description="Configuration content")
    format: str = Field(default="vyos", description="Configuration format")
    dry_run: bool = Field(default=False, description="Validate without applying")

    @classmethod
    def validate_format(cls, v: str) -> str:
        valid_formats = ["json", "yaml", "xml", "vyos"]
        if v.lower() not in valid_formats:
            raise ValueError(f"format must be one of {valid_formats}")
        return v.lower()


def _get_executor() -> VyOSCommandExecutor:
    """Get VyOS command executor from settings"""
    config = VyOSSSHConfig(
        host=settings.vyos_host,
        port=settings.vyos_port,
        username=settings.vyos_username,
        password=settings.vyos_password,
        timeout=settings.vyos_timeout,
    )
    ssh_client = VyOSSSHClient(config)
    return VyOSCommandExecutor(ssh_client)


def _get_backup_manager() -> ConfigBackupManager:
    """Get configuration backup manager"""
    executor = _get_executor()
    return ConfigBackupManager(executor)


def _get_version_manager() -> ConfigVersionManager:
    """Get configuration version manager"""
    executor = _get_executor()
    return ConfigVersionManager(executor)


# Snapshot Management Endpoints
@router.post("/snapshots", response_model=SnapshotResponse)
async def create_snapshot(request: SnapshotRequest) -> SnapshotResponse:
    """Create a configuration snapshot

    Args:
        request: Snapshot request parameters

    Returns:
        Created snapshot details
    """
    try:
        manager = _get_backup_manager()

        snapshot = await manager.create_snapshot(
            name=request.name,
            description=request.description,
            format=BackupFormat(request.format),
            include_system=request.include_system,
            include_keys=request.include_keys,
        )

        return SnapshotResponse(
            id=snapshot.id,
            name=snapshot.name,
            description=snapshot.description,
            timestamp=snapshot.timestamp.isoformat(),
            format=snapshot.format.value,
            size=snapshot.size,
            checksum=snapshot.checksum,
            status=snapshot.status.value,
            version_info=snapshot.version_info,
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/snapshots", response_model=list[SnapshotResponse])
async def list_snapshots() -> list[SnapshotResponse]:
    """List all configuration snapshots

    Returns:
        List of snapshots
    """
    try:
        manager = _get_backup_manager()
        snapshots = await manager.list_snapshots()

        return [
            SnapshotResponse(
                id=s.id,
                name=s.name,
                description=s.description,
                timestamp=s.timestamp.isoformat(),
                format=s.format.value,
                size=s.size,
                checksum=s.checksum,
                status=s.status.value,
                version_info=s.version_info,
            )
            for s in snapshots
        ]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/snapshots/{snapshot_id}", response_model=SnapshotResponse)
async def get_snapshot(snapshot_id: str) -> SnapshotResponse:
    """Get a specific configuration snapshot

    Args:
        snapshot_id: Snapshot ID

    Returns:
        Snapshot details
    """
    try:
        manager = _get_backup_manager()
        snapshot = await manager.get_snapshot(snapshot_id)

        if not snapshot:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")

        return SnapshotResponse(
            id=snapshot.id,
            name=snapshot.name,
            description=snapshot.description,
            timestamp=snapshot.timestamp.isoformat(),
            format=snapshot.format.value,
            size=snapshot.size,
            checksum=snapshot.checksum,
            status=snapshot.status.value,
            version_info=snapshot.version_info,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/snapshots/{snapshot_id}")
async def delete_snapshot(snapshot_id: str) -> dict[str, str]:
    """Delete a configuration snapshot

    Args:
        snapshot_id: Snapshot ID

    Returns:
        Deletion confirmation
    """
    try:
        manager = _get_backup_manager()
        deleted = await manager.delete_snapshot(snapshot_id)

        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Snapshot not found")

        return {"message": "Snapshot deleted successfully", "snapshot_id": snapshot_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/snapshots/{snapshot_id}/restore")
async def restore_from_snapshot(
    snapshot_id: str, request: RestoreRequest
) -> dict[str, Any]:
    """Restore configuration from snapshot

    Args:
        snapshot_id: Snapshot ID
        request: Restore request parameters

    Returns:
        Restore result
    """
    try:
        manager = _get_backup_manager()
        result = await manager.restore_from_snapshot(snapshot_id, dry_run=request.dry_run)

        if not result.get("success"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.get("message"))

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/snapshots/{snapshot_id1}/compare/{snapshot_id2}", response_model=list[ConfigDiffResponse])
async def compare_snapshots(
    snapshot_id1: str, snapshot_id2: str
) -> list[ConfigDiffResponse]:
    """Compare two configuration snapshots

    Args:
        snapshot_id1: First snapshot ID
        snapshot_id2: Second snapshot ID

    Returns:
        List of configuration differences
    """
    try:
        manager = _get_backup_manager()
        diffs = await manager.compare_configs(snapshot_id1, snapshot_id2)

        return [
            ConfigDiffResponse(
                path=d.path,
                old_value=d.old_value,
                new_value=d.new_value,
                change_type=d.change_type,
                metadata=d.metadata,
            )
            for d in diffs
        ]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# Configuration Export/Import Endpoints
@router.get("/export", response_model=ExportResponse)
async def export_config(
    format: str = Query("vyos", description="Export format: json, yaml, xml, vyos"),
    include_system: bool = Query(True, description="Include system information"),
) -> ExportResponse:
    """Export current configuration

    Args:
        format: Export format
        include_system: Include system information

    Returns:
        Exported configuration
    """
    try:
        manager = _get_backup_manager()

        content = await manager.export_config(
            format=BackupFormat(format),
            include_system=include_system,
        )

        # Calculate checksum
        import hashlib
        checksum = hashlib.sha256(content.encode()).hexdigest()

        return ExportResponse(
            format=format,
            content=content,
            timestamp=datetime.now().isoformat(),
            checksum=checksum,
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/import")
async def import_config(request: ImportRequest) -> dict[str, Any]:
    """Import configuration

    Args:
        request: Import request parameters

    Returns:
        Import result
    """
    try:
        manager = _get_backup_manager()

        result = await manager.import_config(
            config=request.config,
            format=BackupFormat(request.format),
            dry_run=request.dry_run,
        )

        if not result.get("success"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.get("message"))

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


# Configuration Version Management Endpoints
@router.post("/versions", response_model=VersionResponse)
async def create_version(request: VersionRequest) -> VersionResponse:
    """Create a new configuration version

    Args:
        request: Version request parameters

    Returns:
        Created version details
    """
    try:
        manager = _get_version_manager()

        version = await manager.create_version(
            name=request.name,
            description=request.description,
            tags=request.tags,
        )

        return VersionResponse(
            id=version.id,
            version=version.version,
            name=version.name,
            description=version.description,
            created_at=version.created_at.isoformat(),
            created_by=version.created_by,
            status=version.status.value,
            size=version.size,
            checksum=version.checksum,
            config_hash=version.config_hash,
            parent_version=version.parent_version,
            tags=version.tags,
        )
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/versions", response_model=list[VersionResponse])
async def list_versions() -> list[VersionResponse]:
    """List all configuration versions

    Returns:
        List of configuration versions
    """
    try:
        manager = _get_version_manager()
        versions = await manager.list_versions()

        return [
            VersionResponse(
                id=v.id,
                version=v.version,
                name=v.name,
                description=v.description,
                created_at=v.created_at.isoformat(),
                created_by=v.created_by,
                status=v.status.value,
                size=v.size,
                checksum=v.checksum,
                config_hash=v.config_hash,
                parent_version=v.parent_version,
                tags=v.tags,
            )
            for v in versions
        ]
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/versions/{version_id}", response_model=VersionResponse)
async def get_version(version_id: str) -> VersionResponse:
    """Get a specific configuration version

    Args:
        version_id: Version ID

    Returns:
        Version details
    """
    try:
        manager = _get_version_manager()
        version = await manager.get_version(version_id)

        if not version:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

        return VersionResponse(
            id=version.id,
            version=version.version,
            name=version.name,
            description=version.description,
            created_at=version.created_at.isoformat(),
            created_by=version.created_by,
            status=version.status.value,
            size=version.size,
            checksum=version.checksum,
            config_hash=version.config_hash,
            parent_version=version.parent_version,
            tags=version.tags,
        )
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.delete("/versions/{version_id}")
async def delete_version(version_id: str) -> dict[str, str]:
    """Delete a configuration version

    Args:
        version_id: Version ID

    Returns:
        Deletion confirmation
    """
    try:
        manager = _get_version_manager()
        deleted = await manager.delete_version(version_id)

        if not deleted:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Version not found")

        return {"message": "Version deleted successfully", "version_id": version_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/versions/{version_id}/restore")
async def restore_version(
    version_id: str, request: RestoreRequest
) -> dict[str, Any]:
    """Restore configuration from version

    Args:
        version_id: Version ID
        request: Restore request parameters

    Returns:
        Restore result
    """
    try:
        manager = _get_version_manager()
        result = await manager.restore_version(version_id, dry_run=request.dry_run)

        if not result.get("success"):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=result.get("message"))

        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.get("/current")
async def get_current_config(
    format: str = Query("vyos", description="Format: json, yaml, xml, vyos"),
) -> dict[str, Any]:
    """Get current running configuration

    Args:
        format: Response format

    Returns:
        Current configuration
    """
    try:
        manager = _get_backup_manager()

        if format == "vyos":
            content = await manager.export_config(BackupFormat.VYOS)
            return {"format": "vyos", "content": content}
        elif format == "json":
            content = await manager.export_config(BackupFormat.JSON)
            import json
            return json.loads(content)
        elif format == "yaml":
            content = await manager.export_config(BackupFormat.YAML)
            return {"format": "yaml", "content": content}
        elif format == "xml":
            content = await manager.export_config(BackupFormat.XML)
            return {"format": "xml", "content": content}

    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=str(e))


@router.post("/validate")
async def validate_config(request: ImportRequest) -> dict[str, Any]:
    """Validate configuration without applying

    Args:
        request: Configuration to validate

    Returns:
        Validation result
    """
    try:
        manager = _get_backup_manager()

        result = await manager.import_config(
            config=request.config,
            format=BackupFormat(request.format),
            dry_run=True,
        )

        if not result.get("success"):
            return {"valid": False, "errors": [result.get("message")]}

        return {"valid": True, "errors": []}
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_ERROR, detail=str(e))

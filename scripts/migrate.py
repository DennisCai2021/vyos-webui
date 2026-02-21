#!/usr/bin/env python3
"""
VyOS WebUI Migration Tool
Handles configuration and data migration between versions
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path


CONFIG_DIR = Path("/config/vyos-webui")
BACKUP_DIR = Path("/config/vyos-webui/backups")
ETC_DIR = Path("/etc/vyos-webui")
VERSION_FILE = Path("/opt/vyos-webui/VERSION")


def get_current_version() -> str:
    """Get currently installed version"""
    if VERSION_FILE.exists():
        return VERSION_FILE.read_text().strip()
    return "1.0.0"


def create_backup(version: str) -> Path:
    """Create a backup of current configuration"""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_name = f"vyos-webui-backup-v{version}-{timestamp}"
    backup_path = BACKUP_DIR / backup_name

    print(f"Creating backup at: {backup_path}")

    # Backup config directory
    if CONFIG_DIR.exists():
        shutil.copytree(CONFIG_DIR, backup_path / "config")

    # Backup etc directory
    if ETC_DIR.exists():
        shutil.copytree(ETC_DIR, backup_path / "etc")

    # Create metadata
    metadata = {
        "version": version,
        "timestamp": timestamp,
        "backup_name": backup_name,
    }
    (backup_path / "metadata.json").write_text(json.dumps(metadata, indent=2))

    # Create tar archive
    tar_path = BACKUP_DIR / f"{backup_name}.tar.gz"
    subprocess.run(
        ["tar", "-czf", str(tar_path), "-C", str(BACKUP_DIR), backup_name],
        check=True,
    )

    # Remove the temporary directory
    shutil.rmtree(backup_path)

    print(f"Backup created: {tar_path}")
    return tar_path


def restore_backup(backup_path: Path) -> bool:
    """Restore configuration from backup"""
    if not backup_path.exists():
        print(f"Error: Backup not found: {backup_path}")
        return False

    temp_dir = BACKUP_DIR / "temp_restore"
    temp_dir.mkdir(parents=True, exist_ok=True)

    try:
        print(f"Extracting backup: {backup_path}")
        subprocess.run(
            ["tar", "-xzf", str(backup_path), "-C", str(temp_dir)],
            check=True,
        )

        # Find the extracted directory
        extracted = list(temp_dir.iterdir())[0] if list(temp_dir.iterdir()) else None
        if not extracted:
            print("Error: No files found in backup")
            return False

        # Restore config directory
        config_src = extracted / "config"
        if config_src.exists():
            if CONFIG_DIR.exists():
                shutil.rmtree(CONFIG_DIR)
            shutil.copytree(config_src, CONFIG_DIR)

        # Restore etc directory
        etc_src = extracted / "etc"
        if etc_src.exists():
            if ETC_DIR.exists():
                shutil.rmtree(ETC_DIR)
            shutil.copytree(etc_src, ETC_DIR)

        print("Backup restored successfully")
        return True

    finally:
        # Cleanup
        if temp_dir.exists():
            shutil.rmtree(temp_dir)


def list_backups() -> list[Path]:
    """List available backups"""
    if not BACKUP_DIR.exists():
        return []

    backups = sorted(
        BACKUP_DIR.glob("vyos-webui-backup-*.tar.gz"),
        key=lambda p: p.stat().st_mtime,
        reverse=True,
    )
    return backups


def check_compatibility(from_version: str, to_version: str) -> tuple[bool, str]:
    """Check if versions are compatible for upgrade"""
    # Simple compatibility check - all 1.x versions are compatible
    from_major = int(from_version.split(".")[0])
    to_major = int(to_version.split(".")[0])

    if from_major != to_major:
        return False, f"Major version mismatch: {from_version} -> {to_version}"

    return True, "Compatible"


def migrate_config(from_version: str, to_version: str) -> bool:
    """Migrate configuration between versions"""
    print(f"Migrating configuration from v{from_version} to v{to_version}")

    # Load current config
    config_file = CONFIG_DIR / "config.json"
    if not config_file.exists():
        print("No existing configuration found")
        return True

    try:
        config = json.loads(config_file.read_text())

        # Perform version-specific migrations
        if from_version < "1.0.0":
            # Pre-1.0 migrations
            pass

        # Add any future migrations here

        # Update version in config
        config["version"] = to_version
        config["last_migrated"] = datetime.now().isoformat()

        # Save migrated config
        config_file.write_text(json.dumps(config, indent=2))

        print("Configuration migrated successfully")
        return True

    except Exception as e:
        print(f"Error migrating configuration: {e}")
        return False


def perform_upgrade(new_version: str) -> bool:
    """Perform full upgrade process"""
    current_version = get_current_version()

    print(f"Upgrading VyOS WebUI from v{current_version} to v{new_version}")

    # Check compatibility
    compatible, message = check_compatibility(current_version, new_version)
    if not compatible:
        print(f"Compatibility check failed: {message}")
        return False
    print(f"Compatibility check passed: {message}")

    # Create backup
    print("\nStep 1: Creating backup...")
    backup_path = create_backup(current_version)

    # Stop service
    print("\nStep 2: Stopping service...")
    try:
        subprocess.run(["systemctl", "stop", "vyos-webui"], check=True)
    except subprocess.CalledProcessError:
        print("Warning: Could not stop service")

    # Migrate configuration
    print("\nStep 3: Migrating configuration...")
    if not migrate_config(current_version, new_version):
        print("Configuration migration failed")
        print(f"To rollback, use: {sys.argv[0]} rollback {backup_path}")
        return False

    # Update version file
    print("\nStep 4: Updating version...")
    VERSION_FILE.write_text(new_version)

    # Start service
    print("\nStep 5: Starting service...")
    try:
        subprocess.run(["systemctl", "start", "vyos-webui"], check=True)
    except subprocess.CalledProcessError:
        print("Warning: Could not start service")

    print("\n========================================")
    print("Upgrade completed successfully!")
    print(f"Backup saved at: {backup_path}")
    print("========================================")

    return True


def rollback(backup_path: Path) -> bool:
    """Rollback to previous version using backup"""
    print(f"Rolling back to backup: {backup_path}")

    # Stop service
    print("Stopping service...")
    try:
        subprocess.run(["systemctl", "stop", "vyos-webui"], check=True)
    except subprocess.CalledProcessError:
        print("Warning: Could not stop service")

    # Restore backup
    print("Restoring backup...")
    if not restore_backup(backup_path):
        print("Rollback failed")
        return False

    # Start service
    print("Starting service...")
    try:
        subprocess.run(["systemctl", "start", "vyos-webui"], check=True)
    except subprocess.CalledProcessError:
        print("Warning: Could not start service")

    print("Rollback completed successfully")
    return True


def main():
    parser = argparse.ArgumentParser(description="VyOS WebUI Migration Tool")
    subparsers = parser.add_subparsers(title="Commands", dest="command")

    # Backup command
    backup_parser = subparsers.add_parser("backup", help="Create configuration backup")

    # Restore command
    restore_parser = subparsers.add_parser("restore", help="Restore from backup")
    restore_parser.add_argument("backup", help="Backup file path")

    # List command
    list_parser = subparsers.add_parser("list", help="List available backups")

    # Upgrade command
    upgrade_parser = subparsers.add_parser("upgrade", help="Upgrade to new version")
    upgrade_parser.add_argument("version", help="New version number")

    # Rollback command
    rollback_parser = subparsers.add_parser("rollback", help="Rollback to backup")
    rollback_parser.add_argument("backup", help="Backup file path")

    # Version command
    version_parser = subparsers.add_parser("version", help="Show current version")

    args = parser.parse_args()

    if args.command == "backup":
        version = get_current_version()
        create_backup(version)
    elif args.command == "restore":
        restore_backup(Path(args.backup))
    elif args.command == "list":
        backups = list_backups()
        if not backups:
            print("No backups found")
        else:
            print("Available backups:")
            for backup in backups:
                mtime = datetime.fromtimestamp(backup.stat().st_mtime)
                print(f"  {backup.name} ({mtime.strftime('%Y-%m-%d %H:%M:%S')})")
    elif args.command == "upgrade":
        perform_upgrade(args.version)
    elif args.command == "rollback":
        rollback(Path(args.backup))
    elif args.command == "version":
        print(f"VyOS WebUI version: {get_current_version()}")
    else:
        parser.print_help()


if __name__ == "__main__":
    main()

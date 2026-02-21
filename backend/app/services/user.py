"""User and Permission Management Service"""
import hashlib
import secrets
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Any
import json
from pathlib import Path

from app.core.security import hash_password, verify_password


class Permission(str, Enum):
    """User permissions"""

    # System permissions
    SYSTEM_READ = "system:read"
    SYSTEM_WRITE = "system:write"
    SYSTEM_ADMIN = "system:admin"

    # Network permissions
    NETWORK_READ = "network:read"
    NETWORK_WRITE = "network:write"
    NETWORK_ADMIN = "network:admin"

    # Firewall permissions
    FIREWALL_READ = "firewall:read"
    FIREWALL_WRITE = "firewall:write"
    FIREWALL_ADMIN = "firewall:admin"

    # VPN permissions
    VPN_READ = "vpn:read"
    VPN_WRITE = "vpn:write"
    VPN_ADMIN = "vpn:admin"

    # User management permissions
    USER_READ = "user:read"
    USER_WRITE = "user:write"
    USER_ADMIN = "user:admin"

    # Log permissions
    LOG_READ = "log:read"
    LOG_WRITE = "log:write"
    LOG_ADMIN = "log:admin"

    # Configuration permissions
    CONFIG_READ = "config:read"
    CONFIG_WRITE = "config:write"
    CONFIG_ADMIN = "config:admin"


class MFAMethod(str, Enum):
    """Multi-factor authentication methods"""

    NONE = "none"
    TOTP = "totp"  # Time-based One-Time Password
    SMS = "sms"
    EMAIL = "email"
    HARDWARE_TOKEN = "hardware_token"


@dataclass
class Role:
    """Role definition"""

    name: str
    description: str | None = None
    permissions: list[Permission] = field(default_factory=list)
    is_system: bool = False  # System roles cannot be deleted


@dataclass
class User:
    """User account"""

    username: str
    full_name: str | None = None
    email: str | None = None
    password_hash: str = ""
    roles: list[str] = field(default_factory=list)
    enabled: bool = True
    mfa_enabled: bool = False
    mfa_method: MFAMethod = MFAMethod.NONE
    mfa_secret: str | None = None  # For TOTP
    created_at: datetime = field(default_factory=datetime.now)
    last_login: datetime | None = None
    failed_login_attempts: int = 0
    locked_until: datetime | None = None


@dataclass
class Session:
    """User session"""

    session_id: str
    username: str
    created_at: datetime = field(default_factory=datetime.now)
    expires_at: datetime | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    mfa_verified: bool = False


@dataclass
class AuditLog:
    """Audit log entry"""

    id: str
    timestamp: datetime
    username: str
    action: str
    resource: str | None = None
    ip_address: str | None = None
    success: bool = True
    details: str | None = None


class UserService:
    """Service for user and permission management"""

    def __init__(self, data_dir: str | None = None):
        """Initialize user service

        Args:
            data_dir: Directory for user data storage
        """
        if data_dir:
            self.data_dir = Path(data_dir)
        else:
            # Try several locations in order of preference
            possible_dirs = [
                Path("/var/lib/vyos-webui/users"),
                Path("/tmp/vyos-webui/users"),
                Path.home() / ".vyos-webui" / "users",
                Path("./data/users"),
            ]
            for dir_path in possible_dirs:
                try:
                    dir_path.mkdir(parents=True, exist_ok=True)
                    self.data_dir = dir_path
                    break
                except (PermissionError, OSError):
                    continue
            else:
                # Fallback to current directory
                self.data_dir = Path("./users")
                self.data_dir.mkdir(parents=True, exist_ok=True)

        self.data_dir.mkdir(parents=True, exist_ok=True)

        # Initialize default roles
        self._init_default_roles()

        # Load users and sessions
        self.users = self._load_users()
        self.sessions = self._load_sessions()
        self.audit_logs = self._load_audit_logs()

    def _init_default_roles(self):
        """Initialize default system roles"""
        self.default_roles = {
            "admin": Role(
                name="admin",
                description="System administrator with full access",
                permissions=list(Permission),
                is_system=True,
            ),
            "user": Role(
                name="user",
                description="Regular user with read-only access",
                permissions=[
                    Permission.SYSTEM_READ,
                    Permission.NETWORK_READ,
                    Permission.FIREWALL_READ,
                    Permission.VPN_READ,
                    Permission.LOG_READ,
                    Permission.CONFIG_READ,
                ],
                is_system=True,
            ),
            "operator": Role(
                name="operator",
                description="Network operator with write access",
                permissions=[
                    Permission.SYSTEM_READ,
                    Permission.NETWORK_WRITE,
                    Permission.FIREWALL_WRITE,
                    Permission.VPN_WRITE,
                    Permission.LOG_READ,
                    Permission.CONFIG_WRITE,
                ],
                is_system=True,
            ),
        }

    def _load_users(self) -> dict[str, User]:
        """Load users from storage"""
        users_file = self.data_dir / "users.json"

        if not users_file.exists():
            # Create default admin user vyos/vyos
            default_admin = User(
                username="vyos",
                full_name="VyOS Administrator",
                email="vyos@vyos.local",
                password_hash=hash_password("vyos"),  # Default password vyos/vyos
                roles=["admin"],
                enabled=True,
            )
            return {"vyos": default_admin}

        with open(users_file, "r") as f:
            data = json.load(f)

        users = {}
        for username, user_data in data.items():
            users[username] = User(
                username=username,
                full_name=user_data.get("full_name"),
                email=user_data.get("email"),
                password_hash=user_data.get("password_hash", ""),
                roles=user_data.get("roles", []),
                enabled=user_data.get("enabled", True),
                mfa_enabled=user_data.get("mfa_enabled", False),
                mfa_method=MFAMethod(user_data.get("mfa_method", "none")),
                mfa_secret=user_data.get("mfa_secret"),
                created_at=datetime.fromisoformat(user_data.get("created_at", datetime.now().isoformat())),
                last_login=datetime.fromisoformat(user_data["last_login"]) if user_data.get("last_login") else None,
                failed_login_attempts=user_data.get("failed_login_attempts", 0),
                locked_until=datetime.fromisoformat(user_data["locked_until"]) if user_data.get("locked_until") else None,
            )

        return users

    def _save_users(self):
        """Save users to storage"""
        users_file = self.data_dir / "users.json"

        data = {}
        for username, user in self.users.items():
            data[username] = {
                "full_name": user.full_name,
                "email": user.email,
                "password_hash": user.password_hash,
                "roles": user.roles,
                "enabled": user.enabled,
                "mfa_enabled": user.mfa_enabled,
                "mfa_method": user.mfa_method.value,
                "mfa_secret": user.mfa_secret,
                "created_at": user.created_at.isoformat(),
                "last_login": user.last_login.isoformat() if user.last_login else None,
                "failed_login_attempts": user.failed_login_attempts,
                "locked_until": user.locked_until.isoformat() if user.locked_until else None,
            }

        with open(users_file, "w") as f:
            json.dump(data, f, indent=2)

    def _load_sessions(self) -> dict[str, Session]:
        """Load sessions from storage"""
        sessions_file = self.data_dir / "sessions.json"

        if not sessions_file.exists():
            return {}

        with open(sessions_file, "r") as f:
            data = json.load(f)

        sessions = {}
        current_time = datetime.now()

        for session_id, session_data in data.items():
            # Check if session is expired
            expires_at = datetime.fromisoformat(session_data["expires_at"]) if session_data.get("expires_at") else None
            if expires_at and expires_at < current_time:
                continue  # Skip expired sessions

            sessions[session_id] = Session(
                session_id=session_id,
                username=session_data["username"],
                created_at=datetime.fromisoformat(session_data["created_at"]),
                expires_at=expires_at,
                ip_address=session_data.get("ip_address"),
                user_agent=session_data.get("user_agent"),
                mfa_verified=session_data.get("mfa_verified", False),
            )

        return sessions

    def _save_sessions(self):
        """Save sessions to storage"""
        sessions_file = self.data_dir / "sessions.json"

        data = {}
        for session_id, session in self.sessions.items():
            data[session_id] = {
                "username": session.username,
                "created_at": session.created_at.isoformat(),
                "expires_at": session.expires_at.isoformat() if session.expires_at else None,
                "ip_address": session.ip_address,
                "user_agent": session.user_agent,
                "mfa_verified": session.mfa_verified,
            }

        with open(sessions_file, "w") as f:
            json.dump(data, f, indent=2)

    def _load_audit_logs(self) -> list[AuditLog]:
        """Load audit logs from storage"""
        logs_file = self.data_dir / "audit_logs.json"

        if not logs_file.exists():
            return []

        with open(logs_file, "r") as f:
            data = json.load(f)

        logs = []
        for log_data in data:
            logs.append(AuditLog(
                id=log_data["id"],
                timestamp=datetime.fromisoformat(log_data["timestamp"]),
                username=log_data["username"],
                action=log_data["action"],
                resource=log_data.get("resource"),
                ip_address=log_data.get("ip_address"),
                success=log_data.get("success", True),
                details=log_data.get("details"),
            ))

        return logs

    def _save_audit_logs(self):
        """Save audit logs to storage"""
        logs_file = self.data_dir / "audit_logs.json"

        # Keep only last 1000 logs
        data = []
        for log in self.audit_logs[-1000:]:
            data.append({
                "id": log.id,
                "timestamp": log.timestamp.isoformat(),
                "username": log.username,
                "action": log.action,
                "resource": log.resource,
                "ip_address": log.ip_address,
                "success": log.success,
                "details": log.details,
            })

        with open(logs_file, "w") as f:
            json.dump(data, f, indent=2)

    # User Management

    def get_user(self, username: str) -> User | None:
        """Get user by username

        Args:
            username: Username

        Returns:
            User object or None
        """
        return self.users.get(username)

    def get_users(self) -> list[User]:
        """Get all users

        Returns:
            List of User objects
        """
        return list(self.users.values())

    def create_user(self, user: User) -> bool:
        """Create a new user

        Args:
            user: User object

        Returns:
            True if successful
        """
        if user.username in self.users:
            raise ValueError(f"User {user.username} already exists")

        # Hash password if provided in plain text
        if user.password_hash and not user.password_hash.startswith("$"):
            user.password_hash = hash_password(user.password_hash)

        self.users[user.username] = user
        self._save_users()

        self._add_audit_log(
            username=user.username,
            action="user_created",
            resource=f"user:{user.username}",
        )

        return True

    def update_user(self, username: str, updates: dict[str, Any]) -> bool:
        """Update user

        Args:
            username: Username
            updates: User updates

        Returns:
            True if successful
        """
        user = self.get_user(username)
        if not user:
            raise ValueError(f"User {username} not found")

        for key, value in updates.items():
            if key == "password":
                # Hash new password
                user.password_hash = hash_password(value)
            elif hasattr(user, key):
                setattr(user, key, value)

        self._save_users()

        self._add_audit_log(
            username=username,
            action="user_updated",
            resource=f"user:{username}",
        )

        return True

    def delete_user(self, username: str) -> bool:
        """Delete user

        Args:
            username: Username

        Returns:
            True if successful
        """
        if username not in self.users:
            raise ValueError(f"User {username} not found")

        # Prevent deletion of last admin
        user = self.users[username]
        if "admin" in user.roles:
            admin_count = sum(1 for u in self.users.values() if "admin" in u.roles)
            if admin_count <= 1:
                raise ValueError("Cannot delete the last admin user")

        del self.users[username]
        self._save_users()

        self._add_audit_log(
            username=username,
            action="user_deleted",
            resource=f"user:{username}",
        )

        return True

    # Authentication

    def authenticate(self, username: str, password: str, ip_address: str | None = None) -> tuple[User | None, str | None]:
        """Authenticate user

        Args:
            username: Username
            password: Password
            ip_address: Client IP address

        Returns:
            Tuple of (User, error_message)
        """
        user = self.get_user(username)

        if not user:
            self._add_audit_log(
                username=username,
                action="login_failed",
                resource=f"user:{username}",
                ip_address=ip_address,
                success=False,
                details="User not found",
            )
            return None, "Invalid credentials"

        # Check if user is locked
        if user.locked_until and user.locked_until > datetime.now():
            remaining = (user.locked_until - datetime.now()).seconds
            return None, f"Account locked. Try again in {remaining} seconds"

        # Check if user is enabled
        if not user.enabled:
            self._add_audit_log(
                username=username,
                action="login_failed",
                resource=f"user:{username}",
                ip_address=ip_address,
                success=False,
                details="User disabled",
            )
            return None, "Account is disabled"

        # Verify password
        if not verify_password(password, user.password_hash):
            user.failed_login_attempts += 1

            # Lock account after too many failed attempts
            if user.failed_login_attempts >= 5:
                user.locked_until = datetime.now() + timedelta(minutes=30)

            self._save_users()

            self._add_audit_log(
                username=username,
                action="login_failed",
                resource=f"user:{username}",
                ip_address=ip_address,
                success=False,
                details=f"Failed attempts: {user.failed_login_attempts}",
            )

            return None, "Invalid credentials"

        # Reset failed login attempts
        user.failed_login_attempts = 0
        user.locked_until = None
        user.last_login = datetime.now()
        self._save_users()

        self._add_audit_log(
            username=username,
            action="login_success",
            resource=f"user:{username}",
            ip_address=ip_address,
        )

        return user, None

    # Session Management

    def create_session(self, username: str, ip_address: str | None = None,
                     user_agent: str | None = None, ttl_hours: int = 24) -> Session:
        """Create a new session

        Args:
            username: Username
            ip_address: Client IP address
            user_agent: User agent string
            ttl_hours: Session time-to-live in hours

        Returns:
            Session object
        """
        session_id = secrets.token_urlsafe(32)
        expires_at = datetime.now() + timedelta(hours=ttl_hours)

        session = Session(
            session_id=session_id,
            username=username,
            expires_at=expires_at,
            ip_address=ip_address,
            user_agent=user_agent,
            mfa_verified=False,
        )

        self.sessions[session_id] = session
        self._save_sessions()

        return session

    def get_session(self, session_id: str) -> Session | None:
        """Get session by ID

        Args:
            session_id: Session ID

        Returns:
            Session object or None
        """
        session = self.sessions.get(session_id)

        # Check if session is expired
        if session and session.expires_at and session.expires_at < datetime.now():
            self.delete_session(session_id)
            return None

        return session

    def delete_session(self, session_id: str) -> bool:
        """Delete session

        Args:
            session_id: Session ID

        Returns:
            True if successful
        """
        if session_id in self.sessions:
            del self.sessions[session_id]
            self._save_sessions()
            return True

        return False

    def get_user_sessions(self, username: str) -> list[Session]:
        """Get all sessions for a user

        Args:
            username: Username

        Returns:
            List of Session objects
        """
        return [s for s in self.sessions.values() if s.username == username]

    def delete_user_sessions(self, username: str) -> int:
        """Delete all sessions for a user

        Args:
            username: Username

        Returns:
            Number of sessions deleted
        """
        count = 0
        for session_id in list(self.sessions.keys()):
            if self.sessions[session_id].username == username:
                del self.sessions[session_id]
                count += 1

        if count > 0:
            self._save_sessions()

        return count

    # Permission Management

    def get_roles(self) -> list[Role]:
        """Get all roles

        Returns:
            List of Role objects
        """
        return list(self.default_roles.values())

    def get_role(self, name: str) -> Role | None:
        """Get role by name

        Args:
            name: Role name

        Returns:
            Role object or None
        """
        return self.default_roles.get(name)

    def has_permission(self, username: str, permission: Permission) -> bool:
        """Check if user has permission

        Args:
            username: Username
            permission: Permission to check

        Returns:
            True if user has permission
        """
        user = self.get_user(username)
        if not user:
            return False

        # Check all user's roles
        for role_name in user.roles:
            role = self.get_role(role_name)
            if role and permission in role.permissions:
                return True

        return False

    def get_user_permissions(self, username: str) -> list[Permission]:
        """Get all permissions for a user

        Args:
            username: Username

        Returns:
            List of Permission objects
        """
        user = self.get_user(username)
        if not user:
            return []

        permissions = set()

        for role_name in user.roles:
            role = self.get_role(role_name)
            if role:
                permissions.update(role.permissions)

        return list(permissions)

    # MFA Management

    def enable_mfa(self, username: str, method: MFAMethod) -> str | None:
        """Enable MFA for user

        Args:
            username: Username
            method: MFA method

        Returns:
            MFA secret (for TOTP) or None
        """
        user = self.get_user(username)
        if not user:
            raise ValueError(f"User {username} not found")

        user.mfa_enabled = True
        user.mfa_method = method

        if method == MFAMethod.TOTP:
            # Generate TOTP secret
            user.mfa_secret = secrets.token_urlsafe(32)

        self._save_users()

        return user.mfa_secret

    def disable_mfa(self, username: str) -> bool:
        """Disable MFA for user

        Args:
            username: Username

        Returns:
            True if successful
        """
        user = self.get_user(username)
        if not user:
            raise ValueError(f"User {username} not found")

        user.mfa_enabled = False
        user.mfa_method = MFAMethod.NONE
        user.mfa_secret = None

        self._save_users()

        return True

    def verify_mfa(self, username: str, code: str) -> bool:
        """Verify MFA code

        Args:
            username: Username
            code: MFA code

        Returns:
            True if code is valid
        """
        user = self.get_user(username)
        if not user or not user.mfa_enabled:
            return False

        # TODO: Implement actual TOTP verification
        # For now, accept any 6-digit code in development
        return len(code) == 6 and code.isdigit()

    # Audit Logging

    def _add_audit_log(self, username: str, action: str, resource: str | None = None,
                      ip_address: str | None = None, success: bool = True, details: str | None = None):
        """Add audit log entry

        Args:
            username: Username
            action: Action performed
            resource: Resource affected
            ip_address: Client IP address
            success: Whether action was successful
            details: Additional details
        """
        log_id = secrets.token_hex(16)

        log = AuditLog(
            id=log_id,
            timestamp=datetime.now(),
            username=username,
            action=action,
            resource=resource,
            ip_address=ip_address,
            success=success,
            details=details,
        )

        self.audit_logs.append(log)
        self._save_audit_logs()

    def get_audit_logs(self, username: str | None = None, limit: int = 100) -> list[AuditLog]:
        """Get audit logs

        Args:
            username: Optional username filter
            limit: Maximum number of logs to return

        Returns:
            List of AuditLog objects
        """
        logs = self.audit_logs

        if username:
            logs = [log for log in logs if log.username == username]

        # Return most recent logs first
        return sorted(logs, key=lambda l: l.timestamp, reverse=True)[:limit]

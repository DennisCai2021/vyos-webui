"""User management endpoints"""
from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel, Field
from typing import Any

from app.services.user import UserService, Role, User, MFAMethod

router = APIRouter(prefix="/users", tags=["users"])

# Global user service instance
_user_service: UserService | None = None


def get_user_service() -> UserService:
    """Get user service instance"""
    global _user_service
    if _user_service is None:
        _user_service = UserService()
    return _user_service


class CreateUserRequest(BaseModel):
    """Create user request"""

    username: str = Field(..., min_length=3, max_length=64, pattern=r"^[a-zA-Z0-9_-]+$")
    full_name: str | None = Field(None, max_length=128)
    email: str | None = Field(None, max_length=256)
    password: str = Field(..., min_length=8, max_length=128)
    roles: list[str] = Field(default_factory=list)


class UpdateUserRequest(BaseModel):
    """Update user request"""

    full_name: str | None = Field(None, max_length=128)
    email: str | None = Field(None, max_length=256, pattern=r"^[^@]+@[^@]+\.[^@]+$")
    roles: list[str] | None = None
    enabled: bool | None = None


class UserResponse(BaseModel):
    """User response"""

    username: str
    full_name: str | None = None
    email: str | None = None
    roles: list[str]
    enabled: bool
    mfa_enabled: bool
    mfa_method: str | None = None
    created_at: str
    last_login: str | None = None
    failed_login_attempts: int = 0
    locked_until: str | None = None


class RoleResponse(BaseModel):
    """Role response"""

    name: str
    description: str | None = None
    permissions: list[str]
    is_system: bool = False


class SessionResponse(BaseModel):
    """Session response"""

    session_id: str
    username: str
    created_at: str
    expires_at: str | None = None
    ip_address: str | None = None
    user_agent: str | None = None
    mfa_verified: bool


class AuditLogResponse(BaseModel):
    """Audit log response"""

    id: str
    timestamp: str
    username: str
    action: str
    resource: str | None = None
    ip_address: str | None = None
    success: bool = True
    details: str | None = None


# User Endpoints

@router.get("", response_model=list[UserResponse])
async def list_users(
    username_filter: str | None = Query(None, description="Filter by username"),
    enabled_only: bool = Query(False, description="Filter by enabled status")
):
    """List all users

    TODO: Implement permission check
    """
    user_service = get_user_service()

    users = user_service.get_users()

    if username_filter:
        users = [u for u in users if username_filter.lower() in u.username.lower()]

    if enabled_only:
        users = [u for u in users if u.enabled]

    return [
        UserResponse(
            username=user.username,
            full_name=user.full_name,
            email=user.email,
            roles=user.roles,
            enabled=user.enabled,
            mfa_enabled=user.mfa_enabled,
            mfa_method=user.mfa_method.value if user.mfa_enabled else None,
            created_at=user.created_at.isoformat(),
            last_login=user.last_login.isoformat() if user.last_login else None,
            failed_login_attempts=user.failed_login_attempts,
            locked_until=user.locked_until.isoformat() if user.locked_until else None,
        )
        for user in users
    ]


@router.get("/{username}", response_model=UserResponse)
async def get_user(username: str):
    """Get specific user

    TODO: Implement permission check
    """
    user_service = get_user_service()
    user = user_service.get_user(username)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {username} not found",
        )

    return UserResponse(
        username=user.username,
        full_name=user.full_name,
        email=user.email,
        roles=user.roles,
        enabled=user.enabled,
        mfa_enabled=user.mfa_enabled,
        mfa_method=user.mfa_method.value if user.mfa_enabled else None,
        created_at=user.created_at.isoformat(),
        last_login=user.last_login.isoformat() if user.last_login else None,
        failed_login_attempts=user.failed_login_attempts,
        locked_until=user.locked_until.isoformat() if user.locked_until else None,
    )


@router.post("")
async def create_user(request: CreateUserRequest) -> dict[str, str]:
    """Create a new user

    TODO: Implement permission check
    """
    user_service = get_user_service()

    user = User(
        username=request.username,
        full_name=request.full_name,
        email=request.email,
        password_hash=request.password,  # Will be hashed in create_user
        roles=request.roles if request.roles else ["user"],
        enabled=True,
    )

    try:
        user_service.create_user(user)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return {"message": "User created successfully", "username": request.username}


@router.put("/{username}")
async def update_user(username: str, request: UpdateUserRequest):
    """Update user

    TODO: Implement permission check
    """
    user_service = get_user_service()

    user = user_service.get_user(username)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"User {username} not found",
        )

    updates = request.dict(exclude_unset=True)

    try:
        user_service.update_user(username, updates)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return {"message": "User updated successfully", "username": username}


@router.delete("/{username}")
async def delete_user(username: str):
    """Delete user

    TODO: Implement permission check
    """
    user_service = get_user_service()

    try:
        user_service.delete_user(username)
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e),
        )

    return {"message": "User deleted successfully", "username": username}


@router.post("/{username}/enable")
async def enable_user(username: str):
    """Enable user account

    TODO: Implement permission check
    """
    user_service = get_user_service()
    user_service.update_user(username, {"enabled": True})

    return {"message": "User enabled successfully", "username": username}


@router.post("/{username}/disable")
async def disable_user(username: str):
    """Disable user account

    TODO: Implement permission check
    """
    user_service = get_user_service()
    user_service.update_user(username, {"enabled": False})

    return {"message": "User disabled successfully", "username": username}


@router.post("/{username}/unlock")
async def unlock_user(username: str):
    """Unlock user account

    TODO: Implement permission check
    """
    user_service = get_user_service()
    user_service.update_user(username, {"failed_login_attempts": 0, "locked_until": None})

    return {"message": "User unlocked successfully", "username": username}


# Role Endpoints

@router.get("/roles", response_model=list[RoleResponse])
async def list_roles():
    """List all roles

    TODO: Implement permission check
    """
    user_service = get_user_service()
    roles = user_service.get_roles()

    return [
        RoleResponse(
            name=role.name,
            description=role.description,
            permissions=[p.value for p in role.permissions],
            is_system=role.is_system,
        )
        for role in roles
    ]


@router.get("/roles/{name}", response_model=RoleResponse)
async def get_role(name: str):
    """Get specific role

    TODO: Implement permission check
    """
    user_service = get_user_service()
    role = user_service.get_role(name)

    if not role:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Role {name} not found",
        )

    return RoleResponse(
        name=role.name,
        description=role.description,
        permissions=[p.value for p in role.permissions],
        is_system=role.is_system,
    )


@router.get("/{username}/permissions", response_model=list[str])
async def get_user_permissions(username: str):
    """Get user permissions

    TODO: Implement permission check
    """
    user_service = get_user_service()
    permissions = user_service.get_user_permissions(username)

    return [p.value for p in permissions]


# Session Endpoints

@router.get("/{username}/sessions", response_model=list[SessionResponse])
async def list_user_sessions(username: str):
    """List user sessions

    TODO: Implement permission check
    """
    user_service = get_user_service()
    sessions = user_service.get_user_sessions(username)

    return [
        SessionResponse(
            session_id=session.session_id,
            username=session.username,
            created_at=session.created_at.isoformat(),
            expires_at=session.expires_at.isoformat() if session.expires_at else None,
            ip_address=session.ip_address,
            user_agent=session.user_agent,
            mfa_verified=session.mfa_verified,
        )
        for session in sessions
    ]


@router.delete("/{username}/sessions")
async def delete_user_sessions(username: str):
    """Delete all user sessions

    TODO: Implement permission check
    """
    user_service = get_user_service()
    count = user_service.delete_user_sessions(username)

    return {"message": f"Deleted {count} sessions", "username": username}


# Audit Log Endpoints

@router.get("/{username}/audit-logs", response_model=list[AuditLogResponse])
async def list_user_audit_logs(
    username: str,
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of logs to return")
):
    """List user audit logs

    TODO: Implement permission check
    """
    user_service = get_user_service()
    logs = user_service.get_audit_logs(username=username, limit=limit)

    return [
        AuditLogResponse(
            id=log.id,
            timestamp=log.timestamp.isoformat(),
            username=log.username,
            action=log.action,
            resource=log.resource,
            ip_address=log.ip_address,
            success=log.success,
            details=log.details,
        )
        for log in logs
    ]


@router.get("/audit-logs", response_model=list[AuditLogResponse])
async def list_audit_logs(
    username_filter: str | None = Query(None, description="Filter by username"),
    action_filter: str | None = Query(None, description="Filter by action"),
    limit: int = Query(100, ge=1, le=1000, description="Maximum number of logs to return")
):
    """List all audit logs

    TODO: Implement permission check
    """
    user_service = get_user_service()
    logs = user_service.get_audit_logs(username=username_filter, limit=limit)

    if action_filter:
        logs = [log for log in logs if action_filter.lower() in log.action.lower()]

    return [
        AuditLogResponse(
            id=log.id,
            timestamp=log.timestamp.isoformat(),
            username=log.username,
            action=log.action,
            resource=log.resource,
            ip_address=log.ip_address,
            success=log.success,
            details=log.details,
        )
        for log in logs
    ]

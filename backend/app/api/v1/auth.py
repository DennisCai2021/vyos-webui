"""Authentication endpoints"""
import logging
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from typing import Any

from app.core.security import (
    create_access_token,
    verify_password,
    get_current_active_user,
    CurrentUserDep,
)
from app.services.user import UserService, MFAMethod

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["authentication"])

# Global user service instance
_user_service: UserService | None = None


def get_user_service() -> UserService:
    """Get user service instance"""
    global _user_service
    if _user_service is None:
        _user_service = UserService()
    return _user_service


class LoginRequest(BaseModel):
    """Login request model"""

    username: str = Field(..., min_length=1, max_length=64)
    password: str = Field(..., min_length=1)
    mfa_code: str | None = Field(None, max_length=6, description="MFA code if MFA is enabled")


class LoginResponse(BaseModel):
    """Login response model"""

    access_token: str
    token_type: str = "bearer"
    expires_in: int = 3600  # Token expiration in seconds
    mfa_required: bool = False
    mfa_method: str | None = None


class RefreshTokenRequest(BaseModel):
    """Refresh token request model"""

    refresh_token: str


class UserResponse(BaseModel):
    """User response model"""

    username: str
    full_name: str | None = None
    email: str | None = None
    roles: list[str]
    permissions: list[str]
    mfa_enabled: bool
    mfa_method: str | None = None
    last_login: str | None = None


class ChangePasswordRequest(BaseModel):
    """Change password request model"""

    current_password: str
    new_password: str = Field(..., min_length=8, max_length=128)


class MFASetupRequest(BaseModel):
    """MFA setup request model"""

    method: str
    mfa_code: str | None = None


class MFASetupResponse(BaseModel):
    """MFA setup response model"""

    mfa_secret: str | None = None
    qr_code_url: str | None = None
    backup_codes: list[str] | None = None


@router.post("/login", response_model=LoginResponse)
async def login(request: LoginRequest) -> LoginResponse:
    """Authenticate user and return access token"""
    user_service = get_user_service()

    # Authenticate user
    user, error = user_service.authenticate(
        request.username,
        request.password,
    )

    if error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error,
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if MFA is required
    if user.mfa_enabled:
        if not request.mfa_code:
            # Return error indicating MFA is required
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="MFA code required",
                headers={
                    "WWW-Authenticate": "Bearer",
                    "X-MFA-Required": "true",
                    "X-MFA-Method": user.mfa_method.value,
                },
            )

        # Verify MFA code
        if not user_service.verify_mfa(request.username, request.mfa_code):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid MFA code",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # Create access token
    access_token = create_access_token(
        data={
            "sub": request.username,
            "roles": user.roles,
        },
        expires_delta=timedelta(hours=24),
    )

    return LoginResponse(
        access_token=access_token,
        expires_in=86400,
        mfa_required=user.mfa_enabled,
        mfa_method=user.mfa_method.value if user.mfa_enabled else None,
    )


@router.post("/logout")
async def logout() -> dict[str, str]:
    """Logout user

    Note: Since we're using JWT tokens, the client simply discards the token.
    This endpoint is mainly for audit logging purposes.
    """
    # TODO: Get username from token and log logout
    return {"message": "Successfully logged out"}


@router.get("/me", response_model=UserResponse)
async def get_current_user_info(
    current_user: CurrentUserDep,
) -> UserResponse:
    """Get current user information"""
    user_service = get_user_service()
    permissions = user_service.get_user_permissions(current_user.username)

    return UserResponse(
        username=current_user.username,
        full_name=current_user.full_name,
        email=current_user.email,
        roles=current_user.roles,
        permissions=[p.value for p in permissions],
        mfa_enabled=current_user.mfa_enabled,
        mfa_method=current_user.mfa_method.value if current_user.mfa_enabled else None,
        last_login=current_user.last_login.isoformat() if current_user.last_login else None,
    )


@router.post("/change-password")
async def change_password(
    request: ChangePasswordRequest,
    current_user: CurrentUserDep,
) -> dict[str, str]:
    """Change user password"""
    user_service = get_user_service()
    user = user_service.get_user(current_user.username)

    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found",
        )

    # Verify current password
    if not verify_password(request.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect",
        )

    # Update password
    user_service.update_user(current_user.username, {"password": request.new_password})

    return {"message": "Password changed successfully"}


@router.post("/mfa/setup", response_model=MFASetupResponse)
async def setup_mfa(
    request: MFASetupRequest,
    current_user: CurrentUserDep,
) -> MFASetupResponse:
    """Setup multi-factor authentication"""
    user_service = get_user_service()

    try:
        mfa_method = MFAMethod(request.method)
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid MFA method: {request.method}",
        )

    if mfa_method == MFAMethod.TOTP:
        # Enable TOTP and get secret
        secret = user_service.enable_mfa(current_user.username, mfa_method)

        # Generate QR code URL
        # TODO: Use actual TOTP library to generate QR code
        qr_code_url = f"otpauth://totp/VyOS:{current_user.username}?secret={secret}&issuer=VyOS"

        return MFASetupResponse(
            mfa_secret=secret,
            qr_code_url=qr_code_url,
            backup_codes=[],
        )
    else:
        # Enable other MFA methods
        user_service.enable_mfa(current_user.username, mfa_method)

        return MFASetupResponse()


@router.post("/mfa/disable")
async def disable_mfa(
    current_user: CurrentUserDep,
) -> dict[str, str]:
    """Disable multi-factor authentication"""
    user_service = get_user_service()
    user_service.disable_mfa(current_user.username)

    return {"message": "MFA disabled successfully"}


@router.get("/mfa/status")
async def get_mfa_status(
    current_user: CurrentUserDep,
) -> dict[str, Any]:
    """Get MFA status"""
    return {
        "mfa_enabled": current_user.mfa_enabled,
        "mfa_method": current_user.mfa_method.value if current_user.mfa_enabled else None,
    }

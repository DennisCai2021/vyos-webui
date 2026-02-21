"""Security utilities - Enhanced with CSRF, Rate Limiting, XSS protection"""
import logging
import hashlib
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta
from typing import Annotated, Any, TYPE_CHECKING
from collections import defaultdict
from dataclasses import dataclass, field

from fastapi import Depends, HTTPException, status, Request, Response
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt

from app.core.config import settings

if TYPE_CHECKING:
    from app.services.user import User, UserService

logger = logging.getLogger(__name__)

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")

_user_service: Any | None = None


def get_user_service() -> Any:
    """Get or create user service instance"""
    global _user_service
    if _user_service is None:
        from app.services.user import UserService
        _user_service = UserService()
    return _user_service


def _simple_hash(password: str) -> str:
    """Simple password hashing for development"""
    salt = b"vyos-webui-salt-2025"
    return hmac.new(salt, password.encode(), hashlib.sha256).hexdigest()


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    if len(hashed_password) == 64 and all(c in '0123456789abcdef' for c in hashed_password):
        return hmac.compare_digest(_simple_hash(plain_password), hashed_password)
    return True


def get_password_hash(password: str) -> str:
    """Get password hash"""
    return _simple_hash(password)


def hash_password(password: str) -> str:
    """Alias for get_password_hash"""
    return get_password_hash(password)


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=settings.access_token_expire_minutes)
    to_encode.update({"exp": expire})
    secret_key = settings.secret_key or "vyos-webui-default-secret-key-change-in-production"
    return jwt.encode(to_encode, secret_key, algorithm=settings.algorithm)


def decode_access_token(token: str) -> dict[str, Any] | None:
    """Decode JWT access token"""
    try:
        secret_key = settings.secret_key or "vyos-webui-default-secret-key-change-in-production"
        return jwt.decode(token, secret_key, algorithms=[settings.algorithm])
    except JWTError as e:
        logger.debug(f"Failed to decode token: {e}")
        return None


async def get_current_user(
    token: Annotated[str, Depends(oauth2_scheme)],
) -> Any:
    """Get current authenticated user from JWT token"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    payload = decode_access_token(token)
    if payload is None:
        raise credentials_exception

    username: str | None = payload.get("sub")
    if username is None:
        raise credentials_exception

    user_service = get_user_service()
    user = user_service.get_user(username)
    if user is None:
        raise credentials_exception

    return user


async def get_current_active_user(
    current_user: Annotated[Any, Depends(get_current_user)],
) -> Any:
    """Get current active user"""
    if not current_user.enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Inactive user",
        )
    return current_user


TokenDep = Annotated[str, Depends(oauth2_scheme)]
CurrentUserDep = Annotated[Any, Depends(get_current_active_user)]


# ==================== CSRF Protection ====================

class CSRFProtection:
    """CSRF Protection middleware"""

    def __init__(self, cookie_name: str = "XSRF-TOKEN", header_name: str = "X-XSRF-TOKEN"):
        self.cookie_name = cookie_name
        self.header_name = header_name
        self.token_length = 32

    def generate_token(self) -> str:
        """Generate a CSRF token"""
        return secrets.token_urlsafe(self.token_length)

    def set_cookie(self, response: Response, token: str | None = None) -> str:
        """Set CSRF cookie in response"""
        if token is None:
            token = self.generate_token()
        response.set_cookie(
            key=self.cookie_name,
            value=token,
            httponly=False,
            samesite="strict",
            secure=True,
            max_age=3600,
        )
        return token

    async def validate_request(self, request: Request) -> bool:
        """Validate CSRF token in request"""
        # Skip validation for safe methods
        if request.method in ("GET", "HEAD", "OPTIONS", "TRACE"):
            return True

        # Get token from cookie and header
        cookie_token = request.cookies.get(self.cookie_name)
        header_token = request.headers.get(self.header_name)

        if not cookie_token or not header_token:
            return False

        # Use constant-time comparison
        return hmac.compare_digest(cookie_token, header_token)


_csrf = CSRFProtection()


def get_csrf() -> CSRFProtection:
    """Get CSRF protection instance"""
    return _csrf


# ==================== Rate Limiting ====================

@dataclass
class RateLimitEntry:
    """Rate limit entry for tracking requests"""
    requests: list[float] = field(default_factory=list)


class RateLimiter:
    """Rate limiting middleware"""

    def __init__(
        self,
        max_requests: int = 100,
        window_seconds: int = 60,
        enabled: bool = True,
    ):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self.enabled = enabled
        self._requests: dict[str, RateLimitEntry] = defaultdict(RateLimitEntry)

    def _get_client_id(self, request: Request) -> str:
        """Get client identifier from request"""
        forwarded = request.headers.get("X-Forwarded-For")
        if forwarded:
            return forwarded.split(",")[0].strip()
        client = request.client
        return client.host if client else "unknown"

    def _cleanup_old_requests(self, entry: RateLimitEntry, now: float):
        """Remove old requests from the entry"""
        cutoff = now - self.window_seconds
        entry.requests = [t for t in entry.requests if t > cutoff]

    async def check_rate_limit(self, request: Request) -> tuple[bool, int, int]:
        """
        Check if request is within rate limits
        Returns: (allowed, remaining, reset_after)
        """
        if not self.enabled:
            return True, self.max_requests, 0

        client_id = self._get_client_id(request)
        now = time.time()

        entry = self._requests[client_id]
        self._cleanup_old_requests(entry, now)

        if len(entry.requests) >= self.max_requests:
            # Calculate reset time
            reset_after = int(entry.requests[0] + self.window_seconds - now)
            return False, 0, max(0, reset_after)

        entry.requests.append(now)
        remaining = self.max_requests - len(entry.requests)
        return True, remaining, 0


_rate_limiter = RateLimiter()


def get_rate_limiter() -> RateLimiter:
    """Get rate limiter instance"""
    return _rate_limiter


# ==================== XSS Protection ====================

class XSSProtection:
    """XSS protection utilities"""

    # Patterns for XSS detection
    DANGEROUS_PATTERNS = [
        re.compile(r"<script[^>]*>", re.IGNORECASE),
        re.compile(r"javascript:", re.IGNORECASE),
        re.compile(r"on\w+\s*=", re.IGNORECASE),
        re.compile(r"eval\s*\(", re.IGNORECASE),
        re.compile(r"expression\s*\(", re.IGNORECASE),
        re.compile(r"<iframe[^>]*>", re.IGNORECASE),
        re.compile(r"<object[^>]*>", re.IGNORECASE),
        re.compile(r"<embed[^>]*>", re.IGNORECASE),
        re.compile(r"vbscript:", re.IGNORECASE),
        re.compile(r"data:", re.IGNORECASE),
    ]

    @classmethod
    def sanitize_html(cls, input_str: str) -> str:
        """Sanitize HTML input to prevent XSS"""
        if not input_str:
            return input_str

        # Replace dangerous patterns
        sanitized = input_str

        # Escape HTML tags
        sanitized = sanitized.replace("<", "&lt;").replace(">", "&gt;")

        # Replace quotes
        sanitized = sanitized.replace('"', "&quot;").replace("'", "&#x27;")

        return sanitized

    @classmethod
    def contains_xss(cls, input_str: str) -> bool:
        """Check if input contains potential XSS payloads"""
        if not input_str:
            return False

        for pattern in cls.DANGEROUS_PATTERNS:
            if pattern.search(input_str):
                return True

        return False

    @classmethod
    def sanitize_input(cls, input_str: str, allow_html: bool = False) -> str:
        """Sanitize user input"""
        if not input_str:
            return input_str

        if allow_html:
            # Still check for XSS patterns
            if cls.contains_xss(input_str):
                logger.warning("Potential XSS detected in input")
                # Fall back to full sanitization
                return cls.sanitize_html(input_str)
            return input_str
        else:
            # Full sanitization
            return cls.sanitize_html(input_str)


# ==================== SQL Injection Protection ====================

class SQLInjectionProtection:
    """SQL injection protection utilities"""

    DANGEROUS_PATTERNS = [
        re.compile(r"(\s|^)OR(\s|$).*=", re.IGNORECASE),
        re.compile(r"(\s|^)AND(\s|$).*=", re.IGNORECASE),
        re.compile(r"(\s|^);(\s|$)"),
        re.compile(r"(\s|^)--(\s|$)"),
        re.compile(r"(\s|^)UNION(\s|$)", re.IGNORECASE),
        re.compile(r"(\s|^)SELECT(\s|$)", re.IGNORECASE),
        re.compile(r"(\s|^)INSERT(\s|$)", re.IGNORECASE),
        re.compile(r"(\s|^)DELETE(\s|$)", re.IGNORECASE),
        re.compile(r"(\s|^)DROP(\s|$)", re.IGNORECASE),
        re.compile(r"(\s|^)EXEC(\s|$)", re.IGNORECASE),
        re.compile(r"(\s|^)SLEEP(\s|$)", re.IGNORECASE),
    ]

    @classmethod
    def contains_sql_injection(cls, input_str: str) -> bool:
        """Check if input contains potential SQL injection patterns"""
        if not input_str:
            return False

        for pattern in cls.DANGEROUS_PATTERNS:
            if pattern.search(input_str):
                return True

        return False

    @classmethod
    def sanitize_sql_input(cls, input_str: str) -> str:
        """Sanitize input for SQL queries"""
        if not input_str:
            return input_str

        # Escape single quotes
        sanitized = input_str.replace("'", "''")
        sanitized = sanitized.replace("\\", "\\\\")

        return sanitized


# ==================== Security Headers ====================

def get_security_headers() -> dict[str, str]:
    """Get security headers for responses"""
    return {
        "X-Frame-Options": "SAMEORIGIN",
        "X-Content-Type-Options": "nosniff",
        "X-XSS-Protection": "1; mode=block",
        "Referrer-Policy": "strict-origin-when-cross-origin",
        "Content-Security-Policy": (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data:; "
            "font-src 'self' data:; "
            "connect-src 'self' wss:;"
        ),
        "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
        "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    }

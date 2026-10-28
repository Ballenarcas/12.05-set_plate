"""Stateless bearer sessions.

The token is ``<user_id>.<expires_at>.<hmac>`` signed with HMAC-SHA256. The
signing key never leaves the backend, so a client cannot mint or extend a
session by editing its local storage. There is no server-side session table:
revocation is achieved by rotating ``AUTH_SECRET_KEY``.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import time
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import get_settings

_bearer = HTTPBearer(auto_error=False)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or expired session.",
        headers={"WWW-Authenticate": "Bearer"},
    )


def _secret() -> bytes:
    settings = get_settings()
    secret = settings.auth_secret_key or settings.supabase_service_role_key
    if not secret:
        raise HTTPException(status_code=500, detail="Authentication is not configured.")
    return secret.encode("utf-8")


def _sign(payload: str) -> str:
    digest = hmac.new(_secret(), payload.encode("utf-8"), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def issue_access_token(user_id: str) -> tuple[str, int]:
    """Return ``(token, expires_at_unix)`` for an authenticated user."""
    ttl_hours = max(1, min(get_settings().auth_token_ttl_hours, 24 * 30))
    expires_at = int(time.time()) + ttl_hours * 3600
    payload = f"{user_id}.{expires_at}"
    return f"{payload}.{_sign(payload)}", expires_at


def _verify_token(token: str) -> str:
    try:
        user_id, expires_raw, signature = token.split(".")
        expires_at = int(expires_raw)
    except (ValueError, AttributeError) as err:
        raise _unauthorized() from err
    if expires_at <= int(time.time()):
        raise _unauthorized()
    if not hmac.compare_digest(_sign(f"{user_id}.{expires_at}"), signature):
        raise _unauthorized()
    try:
        return str(UUID(user_id))
    except ValueError as err:
        raise _unauthorized() from err


def current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> UUID:
    if credentials is None:
        raise _unauthorized()
    return UUID(_verify_token(credentials.credentials))


def current_admin(user_id: UUID = Depends(current_user)) -> UUID:
    if str(user_id) not in get_settings().admin_user_id_list:
        raise HTTPException(status_code=403, detail="Not allowed.")
    return user_id

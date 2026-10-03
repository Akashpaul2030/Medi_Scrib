"""Request authentication.

The API used to trust an ``X-User-Id`` header, which meant any caller could
read any user's notes by changing one header value. Identity now comes from a
short-lived HS256 JWT minted by the Next.js server (which is the only party
that has seen the Google sign-in) and signed with ``API_JWT_SECRET``, a secret
shared between the two halves of the app.

The browser never holds the secret — it fetches a token from ``/api/token`` on
the Next.js side and sends it here as ``Authorization: Bearer <token>``.

There is deliberately no header fallback: a missing or bad token is a 401, so
a misconfigured deploy fails closed rather than serving everyone's data.
"""

import os

import jwt
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

_ALGORITHM = "HS256"
# Tokens are minted per browser session and refreshed on expiry; the leeway
# absorbs clock skew between the Next.js host and this one.
_LEEWAY_SECONDS = 30

_bearer = HTTPBearer(auto_error=False)


def _secret() -> str:
    secret = os.getenv("API_JWT_SECRET", "")
    if not secret:
        # Fail closed. Without a secret we cannot distinguish users at all.
        raise HTTPException(
            status_code=500,
            detail="API_JWT_SECRET is not configured; refusing to authenticate requests.",
        )
    return secret


def get_user_id(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> str:
    """Verified user identity (their email), or 401."""
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Missing bearer token")

    try:
        claims = jwt.decode(
            credentials.credentials,
            _secret(),
            algorithms=[_ALGORITHM],
            leeway=_LEEWAY_SECONDS,
            options={"require": ["exp", "sub"]},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError as e:
        raise HTTPException(status_code=401, detail=f"Invalid token: {e}")

    email = (claims.get("sub") or "").strip().lower()
    if not email:
        raise HTTPException(status_code=401, detail="Token has no subject")
    return email


def mint_token(email: str, ttl_seconds: int = 900) -> str:
    """Sign a token for ``email``. Used by tests and local tooling; in the real
    flow the Next.js server mints these."""
    import time

    now = int(time.time())
    return jwt.encode(
        {"sub": email.strip().lower(), "email": email, "iat": now, "exp": now + ttl_seconds},
        _secret(),
        algorithm=_ALGORITHM,
    )

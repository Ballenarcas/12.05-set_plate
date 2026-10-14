import base64
import hashlib

import bcrypt

_BCRYPT_MAX_BYTES = 72


def _prehash(password: str) -> bytes:
    """bcrypt silently ignores anything past 72 bytes, which would drop entropy
    for long or multi-byte passphrases. Pre-hashing keeps the full input."""
    return base64.b64encode(hashlib.sha256(password.encode("utf-8")).digest())


def hash_password(password: str) -> str:
    """Returns a bcrypt hash (salt included) safe to store in the database."""
    return bcrypt.hashpw(_prehash(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    """Constant-time comparison against a stored hash. Never raises on bad input."""
    if not password or not hashed_password:
        return False
    try:
        return bcrypt.checkpw(_prehash(password), hashed_password.encode("utf-8"))
    except (ValueError, TypeError):
        return False
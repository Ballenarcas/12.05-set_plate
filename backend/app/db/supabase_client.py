from functools import lru_cache

try:
    from supabase import Client, create_client
except ImportError:
    Client = None
    create_client = None

from app.core.config import get_settings


from typing import Any


@lru_cache
def get_supabase(admin: bool = False) -> Any | None:
    if create_client is None:
        return None
    settings = get_settings()
    if not settings.supabase_url:
        return None
    key = (settings.supabase_service_role_key or settings.supabase_key) if admin else settings.supabase_key
    if not key:
        return None
    return create_client(settings.supabase_url, key)

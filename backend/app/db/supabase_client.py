import threading
from functools import lru_cache

import httpx

try:
    from supabase import Client, ClientOptions, create_client
except ImportError:
    Client = None
    ClientOptions = None
    create_client = None

from app.core.config import get_settings


from typing import Any

REQUEST_TIMEOUT_SECONDS = 120  # the Supabase client's own default


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
    # The default HTTP/2 shares one connection between our parallel reads, and when the server
    # closes it they all fail with "Server disconnected". HTTP/1.1 was as fast and never dropped.
    http_client = httpx.Client(http2=False, timeout=REQUEST_TIMEOUT_SECONDS, follow_redirects=True)
    return create_client(settings.supabase_url, key, options=ClientOptions(httpx_client=http_client))


def _warm_client(admin: bool) -> None:
    try:
        client = get_supabase(admin=True) if admin else get_supabase()
        if client is not None:
            client.table("users").select("id").limit(1).execute()
    except Exception:
        pass


def warm_supabase() -> None:
    """Open the first connection before a user request needs it.

    The first call to Supabase pays DNS, TLS and wake-up costs. Running it once
    at startup keeps the first save or dashboard load fast.
    """
    threads = [threading.Thread(target=_warm_client, args=(admin,), daemon=True) for admin in (False, True)]
    for thread in threads:
        thread.start()

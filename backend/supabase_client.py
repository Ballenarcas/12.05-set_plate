from app.core.config import get_settings
from app.db.supabase_client import get_supabase

settings = get_settings()
SUPABASE_URL = settings.supabase_url
SUPABASE_KEY = settings.supabase_key

__all__ = ["SUPABASE_KEY", "SUPABASE_URL", "get_supabase"]

import os
from pathlib import Path
from dotenv import load_dotenv
from supabase import create_client, Client

# Load .env from project root or backend folder
env_path_root = Path(__file__).resolve().parent.parent / ".env"
env_path_backend = Path(__file__).resolve().parent / ".env"

if env_path_root.exists():
    load_dotenv(dotenv_path=env_path_root)
elif env_path_backend.exists():
    load_dotenv(dotenv_path=env_path_backend)
else:
    load_dotenv()

SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY: str = os.getenv("SUPABASE_KEY", "") or os.getenv("SUPABASE_ANON_KEY", "") or os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")

_client: Client | None = None


def get_supabase() -> Client:
    """
    Returns an initialized Supabase client singleton instance.
    Raises ValueError if required environment variables are not set.
    """
    global _client
    if _client is not None:
        return _client

    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError(
            "Supabase credentials missing. Please set SUPABASE_URL and SUPABASE_KEY in your .env file."
        )

    _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


# Optional lazy/direct client instance for quick imports
try:
    if SUPABASE_URL and SUPABASE_KEY:
        supabase: Client | None = create_client(SUPABASE_URL, SUPABASE_KEY)
    else:
        supabase = None
except Exception:
    supabase = None

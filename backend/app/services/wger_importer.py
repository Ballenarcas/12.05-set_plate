import html
import json
import logging
import re
import socket
import uuid
from pathlib import Path
from typing import Any

import httpx

from app.core.config import get_settings
from app.db.supabase_client import get_supabase
from app.schemas.exercise import Exercise

logger = logging.getLogger(__name__)

WGER_BASE_URL = "https://wger.de/api/v2"
CATALOG_PATH = Path(__file__).resolve().parent.parent / "data" / "exercises_catalog.json"


def _force_ipv4():
    """Ensure socket resolution prefers IPv4 to prevent Windows IPv6 connection timeouts."""
    orig_gai = socket.getaddrinfo

    def ipv4_gai(host, port, family=0, type=0, proto=0, flags=0):
        if family == 0 or family == socket.AF_UNSPEC:
            family = socket.AF_INET
        return orig_gai(host, port, family, type, proto, flags)

    socket.getaddrinfo = ipv4_gai


def clean_html(raw_html: str | None) -> str:
    """Strips HTML tags and unescapes entities."""
    if not raw_html:
        return ""
    text = re.sub(r"</?(?:p|div|br|li|ul|ol|h[1-6]|tr|td)[^>]*>", " ", raw_html, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"\s+", " ", text).strip()
    return re.sub(r"\s+([.,!?:;])", r"\1", text)


def parse_wger_exercise(raw: dict[str, Any]) -> Exercise | None:
    """Transforms a raw wger exerciseinfo record into a clean Exercise schema."""
    translations = raw.get("translations", [])
    if not translations:
        return None

    en_trans = next((t for t in translations if t.get("language") == 2), None)
    es_trans = next((t for t in translations if t.get("language") == 4), None)
    fallback_trans = translations[0]

    primary_trans = en_trans or es_trans or fallback_trans
    name = primary_trans.get("name", "").strip()
    if not name:
        return None

    name_es = es_trans.get("name", "").strip() if es_trans else None
    description = clean_html(primary_trans.get("description") or fallback_trans.get("description"))

    category_data = raw.get("category") or {}
    category_name = category_data.get("name", "General") if isinstance(category_data, dict) else "General"

    muscles = [
        m.get("name_en") or m.get("name")
        for m in raw.get("muscles", [])
        if isinstance(m, dict) and (m.get("name_en") or m.get("name"))
    ]
    muscles_sec = [
        m.get("name_en") or m.get("name")
        for m in raw.get("muscles_secondary", [])
        if isinstance(m, dict) and (m.get("name_en") or m.get("name"))
    ]
    equipment = [
        eq.get("name")
        for eq in raw.get("equipment", [])
        if isinstance(eq, dict) and eq.get("name")
    ]

    aliases: set[str] = set()
    if name_es and name_es.lower() != name.lower():
        aliases.add(name_es.lower())

    for t in translations:
        t_aliases = t.get("aliases") or []
        for alias_obj in t_aliases:
            if isinstance(alias_obj, dict) and alias_obj.get("alias"):
                aliases.add(alias_obj["alias"].strip().lower())
            elif isinstance(alias_obj, str) and alias_obj.strip():
                aliases.add(alias_obj.strip().lower())

    images: list[str] = []
    for img in raw.get("images", []):
        if isinstance(img, dict) and img.get("image"):
            images.append(img["image"])

    muscle_images: list[str] = []
    for m in raw.get("muscles", []) + raw.get("muscles_secondary", []):
        if isinstance(m, dict):
            if m.get("image_url_main"):
                muscle_images.append(m["image_url_main"])
            if m.get("image_url_secondary"):
                muscle_images.append(m["image_url_secondary"])

    wger_id = raw.get("id")
    slug = re.sub(r"[^\w]+", "_", name.lower()).strip("_")
    item_id = f"wger_{wger_id}" if wger_id else f"ex_{slug}"

    return Exercise(
        id=item_id,
        wger_id=wger_id,
        name=name,
        name_es=name_es,
        category=category_name,
        description=description,
        muscles=muscles,
        muscles_secondary=muscles_sec,
        equipment=equipment,
        aliases=sorted(list(aliases)),
        images=images,
        muscle_images=list(dict.fromkeys(muscle_images)),
    )


class WgerImporter:
    """Imports exercises from the wger REST API into local catalog and Supabase."""

    def __init__(self, timeout: float = 30.0):
        _force_ipv4()
        self.timeout = timeout
        self.headers = {
            "Accept": "application/json",
            "User-Agent": "SET-PLATE-App/1.0 (fitness-wellness-tracker)",
        }

    def fetch_all_exercises(self, max_items: int | None = None) -> list[Exercise]:
        """Fetches all exercises from wger /exerciseinfo/ endpoint across all pages."""
        endpoint = f"{WGER_BASE_URL}/exerciseinfo/?limit=100"
        exercises: list[Exercise] = []
        next_url: str | None = endpoint

        with httpx.Client(timeout=self.timeout, headers=self.headers) as client:
            while next_url:
                response = client.get(next_url)
                response.raise_for_status()
                data = response.json()
                results = data.get("results", [])

                for item in results:
                    parsed = parse_wger_exercise(item)
                    if parsed:
                        exercises.append(parsed)
                        if max_items and len(exercises) >= max_items:
                            return exercises

                next_url = data.get("next")
                if next_url and next_url.startswith("http://"):
                    next_url = next_url.replace("http://", "https://", 1)

        return exercises

    def save_to_catalog(self, exercises: list[Exercise]) -> Path:
        """Saves imported exercises to local JSON catalog."""
        CATALOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        data = [e.model_dump() for e in exercises]
        with open(CATALOG_PATH, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        return CATALOG_PATH

    def sync_to_supabase(
        self,
        exercises: list[Exercise],
        rich_schema: bool = False,
        supabase_client: Any | None = None,
    ) -> int:
        """Syncs exercises to Supabase database if credentials are configured."""
        try:
            supabase = supabase_client or get_supabase(admin=True)
            if not supabase:
                logger.info("Supabase not configured or client not available. Skipping Supabase sync.")
                return 0

            def make_uuid(item: Exercise) -> str:
                return str(uuid.uuid5(uuid.NAMESPACE_DNS, f"wger:{item.wger_id or item.id}"))

            if rich_schema:
                records = [
                    {
                        "id": make_uuid(e),
                        "name": e.name,
                        "name_es": e.name_es,
                        "muscle_group": e.category or (e.muscles[0] if e.muscles else "General"),
                        "description": e.description,
                        "muscles": e.muscles,
                        "equipment": e.equipment[0] if e.equipment else "Bodyweight",
                        "aliases": e.aliases,
                        "images": e.images,
                    }
                    for e in exercises
                ]
            else:
                # Matches public.exercises (id uuid, name text, muscle_group text, equipment text)
                records = [
                    {
                        "id": make_uuid(e),
                        "name": e.name,
                        "muscle_group": e.category or (e.muscles[0] if e.muscles else "General"),
                        "equipment": e.equipment[0] if e.equipment else "Bodyweight",
                    }
                    for e in exercises
                ]

            batch_size = 100
            total_synced = 0
            for i in range(0, len(records), batch_size):
                batch = records[i : i + batch_size]
                supabase.table("exercises").upsert(batch).execute()
                total_synced += len(batch)

            return total_synced
        except Exception as err:
            err_str = str(err)
            if "42501" in err_str or "row-level security" in err_str:
                logger.error(
                    "Supabase RLS Error: Row Level Security blocked the insert. "
                    "Use SUPABASE_SERVICE_ROLE_KEY or add an INSERT policy for anon."
                )
                print(
                    "\n[RLS ERROR] Row-Level Security policy blocked the insert!\n"
                    "The current SUPABASE_KEY in .env is an 'anon' key with read-only permissions.\n"
                    "Fix:\n"
                    "  1. Add SUPABASE_SERVICE_ROLE_KEY=your_secret_key to .env (from Supabase Project Settings -> API), OR\n"
                    "  2. In Supabase SQL editor: ALTER TABLE public.exercises DISABLE ROW LEVEL SECURITY; (or add insert policy).\n"
                )
            else:
                logger.warning(f"Supabase sync failed: {err}")
                print(f"\n[SUPABASE ERROR] {err}\n")
            return 0


def load_cached_exercises() -> list[Exercise]:
    """Loads exercises from local catalog JSON file."""
    if not CATALOG_PATH.exists():
        return []
    try:
        with open(CATALOG_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
            return [Exercise(**item) for item in data]
    except Exception as err:
        logger.error(f"Error reading exercises catalog: {err}")
        return []


def run_import(
    max_items: int | None = None,
    sync_supabase: bool = True,
    rich_schema: bool = False,
    service_key: str | None = None,
) -> dict[str, Any]:
    """High-level runner to import exercises and persist them."""
    importer = WgerImporter()
    exercises = importer.fetch_all_exercises(max_items=max_items)
    importer.save_to_catalog(exercises)

    synced_count = 0
    if sync_supabase:
        client = None
        if service_key:
            from supabase import create_client
            settings = get_settings()
            if settings.supabase_url:
                client = create_client(settings.supabase_url, service_key)
        synced_count = importer.sync_to_supabase(
            exercises, rich_schema=rich_schema, supabase_client=client
        )

    return {
        "status": "success",
        "total_imported": len(exercises),
        "saved_to_catalog": True,
        "synced_to_supabase": synced_count > 0,
        "message": f"Successfully imported {len(exercises)} exercises from wger API.",
    }


def sync_cached_to_supabase(
    rich_schema: bool = False,
    service_key: str | None = None,
) -> dict[str, Any]:
    """Syncs existing exercises from local JSON cache directly to Supabase."""
    exercises = load_cached_exercises()
    if not exercises:
        return {
            "status": "error",
            "total_synced": 0,
            "message": "No exercises found in local catalog to sync.",
        }
    importer = WgerImporter()
    client = None
    if service_key:
        from supabase import create_client
        settings = get_settings()
        if settings.supabase_url:
            client = create_client(settings.supabase_url, service_key)

    count = importer.sync_to_supabase(
        exercises, rich_schema=rich_schema, supabase_client=client
    )
    return {
        "status": "success" if count > 0 else "skipped_or_failed",
        "total_synced": count,
        "message": (
            f"Successfully synced {count} exercises to Supabase."
            if count > 0
            else "Sync to Supabase was not completed. Check RLS policies or service key."
        ),
    }


if __name__ == "__main__":
    print("Fetching exercises from wger API...")
    result = run_import()
    print(f"Done! {result['message']}")


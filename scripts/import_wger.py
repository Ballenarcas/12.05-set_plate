#!/usr/bin/env python3
"""SET&PLATE - wger Exercise Importer CLI

Usage:
    python scripts/import_wger.py [--limit N] [--no-supabase]
"""

import argparse
import sys
from pathlib import Path

# Add backend directory to sys.path
backend_dir = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(backend_dir))

from app.services.wger_importer import run_import, sync_cached_to_supabase


def main():
    parser = argparse.ArgumentParser(description="Import exercises from wger REST API into SET&PLATE.")
    parser.add_argument(
        "--sync-cache",
        action="store_true",
        help="Upload the already downloaded exercises directly to Supabase without re-fetching from wger.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="Maximum number of exercises to import (omit to import all).",
    )
    parser.add_argument(
        "--no-supabase",
        action="store_true",
        help="Skip syncing to Supabase even if credentials are configured.",
    )
    parser.add_argument(
        "--rich",
        action="store_true",
        help="Include extended fields (description, images, aliases) if added to exercises table.",
    )
    parser.add_argument(
        "--service-key",
        type=str,
        default=None,
        help="Supabase service role key to bypass RLS policies.",
    )
    args = parser.parse_args()

    print("========================================")
    print("SET&PLATE - wger API Exercise Importer")
    print("========================================")

    if args.sync_cache:
        print("Mode: Syncing local cached catalog directly to Supabase...")
        result = sync_cached_to_supabase(rich_schema=args.rich, service_key=args.service_key)
        print("\n----------------------------------------")
        print(f"Status: {result['status']}")
        print(f"Total Synced to Supabase: {result.get('total_synced', 0)}")
        print(f"Message: {result['message']}")
        print("----------------------------------------")
        return

    print(f"Target: {'All available exercises' if not args.limit else f'Up to {args.limit} exercises'}")
    print(f"Supabase sync: {'Disabled' if args.no_supabase else 'Enabled (if configured)'}")
    print("Starting import from https://wger.de/api/v2 ...")

    result = run_import(
        max_items=args.limit,
        sync_supabase=not args.no_supabase,
        rich_schema=args.rich,
        service_key=args.service_key,
    )

    print("\n----------------------------------------")
    print(f"Status: {result['status']}")
    print(f"Total Imported: {result['total_imported']}")
    print(f"Saved to Catalog: {result['saved_to_catalog']}")
    print(f"Synced to Supabase: {result['synced_to_supabase']}")
    print(f"Message: {result['message']}")
    print("----------------------------------------")


if __name__ == "__main__":
    main()

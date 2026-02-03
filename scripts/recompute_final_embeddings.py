#!/usr/bin/env python3
"""
Recompute Final Embeddings (Python + numpy)

Reads component vectors + D2P from Supabase, computes weighted average locally,
writes back to lead_embedding_final and clears needs_final_recompute flag.

Formula:
  embedding_final = l2_normalize(0.40*d2p + 0.25*bio + 0.20*website + 0.15*hashtags)
  (weights normalized when components are missing)

Usage:
  python scripts/recompute_final_embeddings.py [--batch-size 25] [--limit 0] [--dry-run]
"""

import os
import sys
import time
import argparse
import json
from typing import List, Dict, Any, Optional

try:
    import numpy as np
    from supabase import create_client, Client
    from dotenv import load_dotenv
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    print("Install: pip install numpy supabase python-dotenv", file=sys.stderr)
    sys.exit(1)

load_dotenv()

# Weights for each component
WEIGHTS = {
    'd2p': 0.40,
    'bio': 0.25,
    'website': 0.20,
    'hashtags': 0.15,
}

DIMS = 1536
PAGE_SIZE = 10  # Small to avoid REST API timeout on vector reads


def get_client() -> Client:
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required", file=sys.stderr)
        sys.exit(1)
    return create_client(url, key)


def l2_normalize(v: np.ndarray) -> np.ndarray:
    """L2-normalize a vector. Returns zero vector if norm is 0."""
    norm = np.linalg.norm(v)
    if norm < 1e-10:
        return v
    return v / norm


def compute_final(
    bio: Optional[List[float]],
    website: Optional[List[float]],
    hashtags: Optional[List[float]],
    d2p: Optional[List[float]],
) -> Optional[List[float]]:
    """Compute weighted average of available components, l2-normalized."""
    result = np.zeros(DIMS, dtype=np.float64)
    total_weight = 0.0

    if d2p is not None:
        result += WEIGHTS['d2p'] * np.array(d2p, dtype=np.float64)
        total_weight += WEIGHTS['d2p']

    if bio is not None:
        result += WEIGHTS['bio'] * np.array(bio, dtype=np.float64)
        total_weight += WEIGHTS['bio']

    if website is not None:
        result += WEIGHTS['website'] * np.array(website, dtype=np.float64)
        total_weight += WEIGHTS['website']

    if hashtags is not None:
        result += WEIGHTS['hashtags'] * np.array(hashtags, dtype=np.float64)
        total_weight += WEIGHTS['hashtags']

    if total_weight < 1e-10:
        return None

    # Normalize by total weight then L2-normalize
    result = result / total_weight
    result = l2_normalize(result)

    return result.tolist()


def fetch_pending_ids(supabase: Client, last_id: str = '', limit: int = PAGE_SIZE) -> List[str]:
    """Fetch lead_ids that need final recompute, cursor-paginated."""
    query = supabase.from_("lead_embedding_components").select(
        "lead_id"
    ).eq(
        "needs_final_recompute", True
    ).order("lead_id")

    if last_id:
        query = query.gt("lead_id", last_id)

    result = query.limit(limit).execute()
    return [r['lead_id'] for r in (result.data or [])]


def parse_vector(v) -> Optional[List[float]]:
    """Parse a vector from Supabase REST API (returned as string or list)."""
    if v is None:
        return None
    if isinstance(v, list):
        return v
    if isinstance(v, str):
        return json.loads(v)
    return None


def fetch_components(supabase: Client, lead_ids: List[str]) -> Dict[str, Dict]:
    """Fetch component vectors for given lead_ids."""
    result = supabase.from_("lead_embedding_components").select(
        "lead_id, embedding_bio, embedding_website, embedding_hashtags"
    ).in_("lead_id", lead_ids).execute()

    out = {}
    for r in (result.data or []):
        out[r['lead_id']] = {
            'embedding_bio': parse_vector(r.get('embedding_bio')),
            'embedding_website': parse_vector(r.get('embedding_website')),
            'embedding_hashtags': parse_vector(r.get('embedding_hashtags')),
        }
    return out


def fetch_d2p(supabase: Client, lead_ids: List[str]) -> Dict[str, List[float]]:
    """Fetch D2P vectors for given lead_ids."""
    result = supabase.from_("lead_embedding_d2p").select(
        "lead_id, embedding_d2p"
    ).in_("lead_id", lead_ids).execute()

    out = {}
    for r in (result.data or []):
        vec = parse_vector(r.get('embedding_d2p'))
        if vec:
            out[r['lead_id']] = vec
    return out


def upsert_finals_batch(supabase: Client, records: List[tuple]):
    """Upsert multiple final embeddings in one call."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    rows = [
        {"lead_id": lid, "embedding_final": json.dumps(emb), "computed_at": now}
        for lid, emb in records
    ]
    # Upsert in chunks of 5 to avoid payload size issues
    for i in range(0, len(rows), 5):
        chunk = rows[i:i+10]
        for attempt in range(3):
            try:
                supabase.from_("lead_embedding_final").upsert(
                    chunk, on_conflict="lead_id"
                ).execute()
                break
            except Exception:
                if attempt < 2:
                    time.sleep(1)
                else:
                    raise


def clear_flag(supabase: Client, lead_ids: List[str]):
    """Clear needs_final_recompute for given lead_ids."""
    from datetime import datetime, timezone
    now = datetime.now(timezone.utc).isoformat()
    supabase.from_("lead_embedding_components").update({
        "needs_final_recompute": False,
        "embedded_at": now,
        "updated_at": now,
    }).in_("lead_id", lead_ids).execute()


def main():
    parser = argparse.ArgumentParser(description="Recompute final embeddings locally")
    parser.add_argument("--batch-size", type=int, default=PAGE_SIZE)
    parser.add_argument("--limit", type=int, default=0, help="Max leads to process (0=all)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    supabase = get_client()

    processed = 0
    errors = 0
    batch_num = 0
    last_id = ''

    print(f"[Final-Recompute] Starting (batch={args.batch_size}, limit={args.limit or 'all'})")

    while True:
        if args.limit and processed >= args.limit:
            break

        # Step 1: Get pending IDs
        ids = fetch_pending_ids(supabase, last_id, args.batch_size)
        if not ids:
            break

        last_id = ids[-1]
        batch_num += 1

        try:
            # Step 2: Fetch vectors (two parallel-ish calls)
            components = fetch_components(supabase, ids)
            d2p_map = fetch_d2p(supabase, ids)

            # Step 3: Compute locally
            computed = []
            for lid in ids:
                comp = components.get(lid, {})
                d2p_vec = d2p_map.get(lid)

                final = compute_final(
                    bio=comp.get('embedding_bio'),
                    website=comp.get('embedding_website'),
                    hashtags=comp.get('embedding_hashtags'),
                    d2p=d2p_vec,
                )

                if final:
                    computed.append((lid, final))

            if args.dry_run:
                print(f"[Final-Recompute] Batch {batch_num}: {len(ids)} read, {len(computed)} computed (dry-run)")
                processed += len(ids)
                continue

            # Step 4: Write back finals
            upsert_finals_batch(supabase, computed)

            # Step 5: Clear flags
            clear_flag(supabase, ids)

            processed += len(ids)
            print(f"[Final-Recompute] Batch {batch_num}: {len(computed)}/{len(ids)} computed+saved (total={processed})")

            # Small delay to avoid rate limiting
            time.sleep(0.2)

        except Exception as e:
            errors += len(ids)
            print(f"[Final-Recompute] ERROR batch {batch_num}: {e}", file=sys.stderr)
            time.sleep(2)

    print(f"\n[Final-Recompute] === {'DRY RUN ' if args.dry_run else ''}COMPLETE ===")
    print(f"[Final-Recompute] Processed: {processed}")
    print(f"[Final-Recompute] Errors: {errors}")


if __name__ == "__main__":
    main()

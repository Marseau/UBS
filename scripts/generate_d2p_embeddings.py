#!/usr/bin/env python3
"""
Generate D2P Professional Embeddings

Generates embedding_d2p for leads that have profession and/or business_category.
Builds clean professional text in Python, then embeds via OpenAI text-embedding-3-small.
Uses paginated queries to avoid timeouts.

Usage:
  python scripts/generate_d2p_embeddings.py [--batch-size 100] [--limit 0] [--dry-run] [--offset 0]
"""

import os
import re
import sys
import time
import argparse
from typing import List, Dict, Any, Optional, Set

try:
    from openai import OpenAI
    from supabase import create_client, Client
    from dotenv import load_dotenv
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    print("Install: pip install openai supabase python-dotenv", file=sys.stderr)
    sys.exit(1)

load_dotenv()

EMBEDDING_MODEL = "text-embedding-3-small"
DEFAULT_BATCH_SIZE = 100
RATE_LIMIT_DELAY_MS = 200
PAGE_SIZE = 1000


def get_clients():
    supabase_url = os.getenv("SUPABASE_URL")
    supabase_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    openai_key = os.getenv("OPENAI_API_KEY")

    if not supabase_url or not supabase_key:
        print("ERROR: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required", file=sys.stderr)
        sys.exit(1)
    if not openai_key:
        print("ERROR: OPENAI_API_KEY required", file=sys.stderr)
        sys.exit(1)

    return create_client(supabase_url, supabase_key), OpenAI(api_key=openai_key)


def build_d2p_text(profession: Optional[str], business_category: Optional[str], bio: Optional[str]) -> Optional[str]:
    """Build clean professional text for D2P embedding."""
    result = ''

    if profession:
        result = profession

    if business_category and business_category.lower() not in ('outros', 'other', ''):
        if result:
            result += '. ' + business_category
        else:
            result = business_category

    if bio:
        clean = bio
        # Remove emojis (Unicode emoji ranges)
        clean = re.sub(
            r'[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF'
            r'\U0001F1E0-\U0001F1FF\U00002702-\U000027B0\U000024C2-\U0001F251'
            r'\U0001F900-\U0001F9FF\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF'
            r'\U00002600-\U000026FF\U0000FE00-\U0000FE0F\U0000200D]+',
            '', clean
        )
        clean = re.sub(r'https?://\S+', '', clean, flags=re.IGNORECASE)
        clean = re.sub(r'www\.\S+', '', clean, flags=re.IGNORECASE)
        clean = re.sub(r'\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}', '', clean)
        clean = re.sub(r'\d{5}[-]?\d{3}', '', clean)
        clean = re.sub(
            r'(clique|link|acesse|saiba mais|fale conosco|agende|whatsapp|dm|direct|inbox|entre em contato|envie|mande)\s*(na|no|aqui|pelo|pela|mensagem)?\s*\S*',
            '', clean, flags=re.IGNORECASE
        )
        clean = clean.replace('|', ' ')
        parts = re.split(r'[.!?\n]+', clean)
        clean = parts[0].strip() if parts else ''
        clean = re.sub(r'\s+', ' ', clean).strip()

        if len(clean) > 5:
            if result:
                result += '. ' + clean
            else:
                result = clean

    if len(result) > 200:
        result = result[:200]

    return result if result else None


def fetch_already_embedded_ids(supabase: Client) -> Set[str]:
    """Fetch lead_ids that already have embedding_d2p."""
    print("[D2P-Embed] Fetching already-embedded lead IDs...")
    ids = set()
    offset = 0
    while True:
        result = supabase.from_("lead_embedding_d2p").select(
            "lead_id"
        ).not_.is_(
            "embedding_d2p", "null"
        ).range(offset, offset + PAGE_SIZE - 1).execute()

        if not result.data:
            break
        for row in result.data:
            ids.add(row['lead_id'])
        offset += PAGE_SIZE
        if len(result.data) < PAGE_SIZE:
            break

    print(f"[D2P-Embed] {len(ids)} leads already have embedding_d2p")
    return ids


def fetch_leads_page(supabase: Client, after_id: str = '') -> List[Dict[str, Any]]:
    """Fetch a page of leads with profession or business_category using cursor pagination."""
    query = supabase.from_("instagram_leads").select(
        "id, username, profession, business_category, bio"
    ).or_(
        "profession.not.is.null,business_category.not.is.null"
    ).order("id")

    if after_id:
        query = query.gt("id", after_id)

    result = query.limit(PAGE_SIZE).execute()
    return result.data or []


def generate_embeddings_batch(openai_client: OpenAI, texts: List[str]) -> List[List[float]]:
    """Generate embeddings for a batch of texts via OpenAI."""
    response = openai_client.embeddings.create(
        model=EMBEDDING_MODEL,
        input=texts
    )
    return [item.embedding for item in response.data]


def upsert_embeddings(supabase: Client, records: List[Dict[str, Any]]):
    """Upsert embedding_d2p into lead_embedding_d2p one at a time with retry."""
    for r in records:
        for attempt in range(3):
            try:
                supabase.from_("lead_embedding_d2p").upsert({
                    "lead_id": r["lead_id"],
                    "embedding_d2p": r["embedding"],
                    "embedding_d2p_text": r["d2p_text"],
                }, on_conflict="lead_id").execute()
                break
            except Exception:
                if attempt < 2:
                    time.sleep(1)
                else:
                    raise


def main():
    parser = argparse.ArgumentParser(description="Generate D2P professional embeddings")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE)
    parser.add_argument("--limit", type=int, default=0, help="Max leads to process (0=all)")
    parser.add_argument("--offset", type=int, default=0, help="Start offset for pagination")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    supabase, openai_client = get_clients()

    # Get already-embedded IDs to skip
    already_embedded = fetch_already_embedded_ids(supabase)

    processed = 0
    errors = 0
    batch_num = 0
    skipped = 0
    last_id = ''
    pending_leads: List[Dict[str, Any]] = []

    print(f"[D2P-Embed] Starting (batch={args.batch_size}, limit={args.limit or 'all'})")

    while True:
        # Fetch page using cursor pagination (no OFFSET timeout)
        raw_leads = fetch_leads_page(supabase, last_id)
        if not raw_leads:
            break
        last_id = raw_leads[-1]['id']

        # Filter and build text
        for lead in raw_leads:
            if lead['id'] in already_embedded:
                skipped += 1
                continue

            d2p_text = build_d2p_text(
                lead.get('profession'),
                lead.get('business_category'),
                lead.get('bio')
            )
            if d2p_text:
                pending_leads.append({
                    'lead_id': lead['id'],
                    'username': lead.get('username', ''),
                    'd2p_text': d2p_text
                })

        # Process pending leads in batches
        while len(pending_leads) >= args.batch_size:
            if args.limit and processed >= args.limit:
                break

            batch = pending_leads[:args.batch_size]
            pending_leads = pending_leads[args.batch_size:]

            if args.limit:
                remaining = args.limit - processed
                if len(batch) > remaining:
                    pending_leads = batch[remaining:] + pending_leads
                    batch = batch[:remaining]

            batch_num += 1

            if args.dry_run:
                for lead in batch[:3]:
                    print(f"  @{lead['username']}: {lead['d2p_text']}")
                processed += len(batch)
                continue

            try:
                print(f"[D2P-Embed] Batch {batch_num}: {len(batch)} leads (done={processed}, skip={skipped})")
                embeddings = generate_embeddings_batch(openai_client, [l['d2p_text'] for l in batch])

                records = [
                    {"lead_id": batch[j]["lead_id"], "embedding": embeddings[j], "d2p_text": batch[j]["d2p_text"]}
                    for j in range(len(batch))
                ]
                upsert_embeddings(supabase, records)
                processed += len(batch)
                time.sleep(RATE_LIMIT_DELAY_MS / 1000.0)

            except Exception as e:
                errors += len(batch)
                print(f"[D2P-Embed] ERROR batch {batch_num}: {e}", file=sys.stderr)
                time.sleep(1)

        if args.limit and processed >= args.limit:
            break

    # Process remaining
    if pending_leads and (not args.limit or processed < args.limit):
        if args.limit:
            pending_leads = pending_leads[:args.limit - processed]

        if pending_leads:
            batch_num += 1
            if args.dry_run:
                for lead in pending_leads[:3]:
                    print(f"  @{lead['username']}: {lead['d2p_text']}")
                processed += len(pending_leads)
            else:
                try:
                    print(f"[D2P-Embed] Batch {batch_num}: {len(pending_leads)} leads (final, done={processed})")
                    embeddings = generate_embeddings_batch(openai_client, [l['d2p_text'] for l in pending_leads])
                    records = [
                        {"lead_id": pending_leads[j]["lead_id"], "embedding": embeddings[j], "d2p_text": pending_leads[j]["d2p_text"]}
                        for j in range(len(pending_leads))
                    ]
                    upsert_embeddings(supabase, records)
                    processed += len(pending_leads)
                except Exception as e:
                    errors += len(pending_leads)
                    print(f"[D2P-Embed] ERROR batch {batch_num}: {e}", file=sys.stderr)

    print(f"\n[D2P-Embed] === {'DRY RUN ' if args.dry_run else ''}COMPLETE ===")
    print(f"[D2P-Embed] Processed: {processed}")
    print(f"[D2P-Embed] Skipped (already embedded): {skipped}")
    print(f"[D2P-Embed] Errors: {errors}")


if __name__ == "__main__":
    main()

#!/usr/bin/env python3
"""
Rebuild D2P Embeddings (fast recovery)

Regenerates embedding_d2p for leads that already have profession/business_category.
Uses OpenAI batch embedding API (up to 2000 texts per call) + individual upsert.

Usage:
  python scripts/rebuild_d2p_embeddings.py [--batch-size 500] [--limit 0]
"""

import os
import sys
import re
import time
import argparse
from typing import List, Dict, Any
from concurrent.futures import ThreadPoolExecutor, as_completed

try:
    from openai import OpenAI
    from supabase import create_client, Client
    from dotenv import load_dotenv
except ImportError as e:
    print(f"Missing: {e}. Install: pip install openai supabase python-dotenv", file=sys.stderr)
    sys.exit(1)

load_dotenv()

EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F1E0-\U0001F1FF"
    "\U00002702-\U000027B0"
    "\U000024C2-\U0001F251"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FA6F"
    "\U0001FA70-\U0001FAFF"
    "\U00002600-\U000026FF"
    "\U0000FE00-\U0000FE0F"
    "\U0000200D"
    "]+", flags=re.UNICODE
)

GENERIC_CATS = {'outros', 'other', ''}


def build_d2p_text(profession: str, category: str, bio: str) -> str:
    """Build clean D2P text from profession + category + first bio sentence."""
    parts = []

    if profession and profession.strip():
        parts.append(profession.strip())

    cat = (category or '').strip().lower()
    if category and cat not in GENERIC_CATS:
        parts.append(category.strip())

    if bio:
        clean = bio
        # Remove first line if it's a category label (< 50 chars)
        lines = clean.split('\n')
        if len(lines) > 1 and len(lines[0].strip()) < 50:
            lines.pop(0)
            clean = '\n'.join(lines)
        # Remove emojis
        clean = EMOJI_RE.sub('', clean)
        # Remove URLs
        clean = re.sub(r'https?://\S+', '', clean, flags=re.IGNORECASE)
        clean = re.sub(r'www\.\S+', '', clean, flags=re.IGNORECASE)
        # Remove phones
        clean = re.sub(r'\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}', '', clean)
        # Remove CTAs
        clean = re.sub(
            r'(clique|link|acesse|saiba mais|fale conosco|agende|whatsapp|dm|direct|inbox|entre em contato|envie|mande)\s*(na|no|aqui|pelo|pela|mensagem)?\s*\S*',
            '', clean, flags=re.IGNORECASE
        )
        clean = clean.replace('|', ' ')
        # First sentence only
        first = re.split(r'[.!?\n]+', clean)[0].strip()
        first = re.sub(r'\s+', ' ', first).strip()
        if len(first) > 5:
            parts.append(first)

    result = '. '.join(parts)
    return result[:200] if len(result) > 200 else result


def fetch_pending(supabase: Client, offset: int, limit: int) -> List[Dict]:
    """Fetch leads needing D2P embedding."""
    result = supabase.from_("instagram_leads").select(
        "id, profession, business_category, bio"
    ).is_(
        "d2p_processed_at", "null"
    ).not_.is_(
        "bio", "null"
    ).order("id").range(offset, offset + limit - 1).execute()
    return result.data or []


def upsert_one(supabase: Client, lead_id: str, embedding: List[float], d2p_text: str) -> bool:
    """Upsert single embedding with retry."""
    for attempt in range(3):
        try:
            supabase.from_("lead_embedding_d2p").upsert({
                "lead_id": lead_id,
                "embedding_d2p": embedding,
                "embedding_d2p_text": d2p_text,
            }, on_conflict="lead_id").execute()
            return True
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
            else:
                print(f"  [ERR] upsert {lead_id}: {e}", file=sys.stderr)
                return False


def mark_processed(supabase: Client, lead_ids: List[str]):
    """Mark leads as D2P processed in batch."""
    # Do in chunks of 50 to avoid timeout
    for i in range(0, len(lead_ids), 50):
        chunk = lead_ids[i:i+50]
        for attempt in range(3):
            try:
                supabase.from_("instagram_leads").update({
                    "d2p_processed_at": "now()"
                }).in_("id", chunk).execute()
                break
            except Exception:
                if attempt < 2:
                    time.sleep(1)


def main():
    parser = argparse.ArgumentParser(description="Rebuild D2P embeddings")
    parser.add_argument("--batch-size", type=int, default=500, help="Texts per OpenAI call")
    parser.add_argument("--limit", type=int, default=0, help="Max leads (0=all)")
    parser.add_argument("--page-size", type=int, default=1000, help="DB fetch page size")
    args = parser.parse_args()

    supabase = create_client(os.getenv("SUPABASE_URL"), os.getenv("SUPABASE_SERVICE_ROLE_KEY"))
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    total_processed = 0
    total_embedded = 0
    total_skipped = 0
    total_errors = 0
    offset = 0
    start_time = time.time()

    print(f"[Rebuild] Starting (batch={args.batch_size}, page={args.page_size})")

    while True:
        leads = fetch_pending(supabase, offset, args.page_size)
        if not leads:
            break
        offset += args.page_size

        # Build D2P texts
        items = []
        for lead in leads:
            text = build_d2p_text(lead.get('profession'), lead.get('business_category'), lead.get('bio'))
            items.append({"lead_id": lead["id"], "d2p_text": text})

        # Process in embedding batches
        for batch_start in range(0, len(items), args.batch_size):
            batch = items[batch_start:batch_start + args.batch_size]

            # Separate items with text vs without
            with_text = [it for it in batch if it["d2p_text"]]
            without_text = [it for it in batch if not it["d2p_text"]]

            if with_text:
                # Call OpenAI batch embedding
                texts = [it["d2p_text"] for it in with_text]
                try:
                    resp = openai_client.embeddings.create(
                        model="text-embedding-3-small",
                        input=texts
                    )
                    embeddings = [d.embedding for d in resp.data]

                    # Upsert individually
                    for it, emb in zip(with_text, embeddings):
                        ok = upsert_one(supabase, it["lead_id"], emb, it["d2p_text"])
                        if ok:
                            total_embedded += 1
                        else:
                            total_errors += 1

                except Exception as e:
                    print(f"  [ERR] OpenAI batch: {e}", file=sys.stderr)
                    total_errors += len(with_text)

            total_skipped += len(without_text)

            # Mark all as processed
            all_ids = [it["lead_id"] for it in batch]
            mark_processed(supabase, all_ids)

            total_processed += len(batch)

            # Progress
            elapsed = time.time() - start_time
            rate = total_processed / elapsed if elapsed > 0 else 0
            print(f"[Rebuild] {total_processed} processed | {total_embedded} embedded | "
                  f"{total_skipped} skipped | {total_errors} errors | "
                  f"{rate:.0f} leads/s | {elapsed:.0f}s elapsed")

            if args.limit and total_processed >= args.limit:
                break

        if args.limit and total_processed >= args.limit:
            break

    elapsed = time.time() - start_time
    print(f"\n[Rebuild] === COMPLETE ===")
    print(f"[Rebuild] Processed: {total_processed}")
    print(f"[Rebuild] Embedded: {total_embedded}")
    print(f"[Rebuild] Skipped: {total_skipped}")
    print(f"[Rebuild] Errors: {total_errors}")
    print(f"[Rebuild] Time: {elapsed/60:.1f} min")


if __name__ == "__main__":
    main()

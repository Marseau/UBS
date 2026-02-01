#!/usr/bin/env python3
"""
Rebuild D2P Embeddings (FAST - direct PostgreSQL)

Uses direct PostgreSQL connection (psycopg2) for batch upserts instead of
Supabase REST API. ~50x faster than REST approach.

Usage:
  python scripts/rebuild_d2p_fast.py [--batch-size 500] [--limit 0]
"""

import os
import sys
import re
import time
import argparse
from typing import List, Dict, Tuple

try:
    from openai import OpenAI
    import psycopg2
    from psycopg2.extras import execute_values
    from dotenv import load_dotenv
except ImportError as e:
    print(f"Missing: {e}. Install: pip install openai psycopg2-binary python-dotenv", file=sys.stderr)
    sys.exit(1)

load_dotenv()

# PostgreSQL direct connection
DB_HOST = "db.qsdfyffuonywmtnlycri.supabase.co"
DB_PORT = 5432
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASS = "Mbf313500Mbf"

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
        lines = clean.split('\n')
        if len(lines) > 1 and len(lines[0].strip()) < 50:
            lines.pop(0)
            clean = '\n'.join(lines)
        clean = EMOJI_RE.sub('', clean)
        clean = re.sub(r'https?://\S+', '', clean, flags=re.IGNORECASE)
        clean = re.sub(r'www\.\S+', '', clean, flags=re.IGNORECASE)
        clean = re.sub(r'\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}', '', clean)
        clean = re.sub(
            r'(clique|link|acesse|saiba mais|fale conosco|agende|whatsapp|dm|direct|inbox|entre em contato|envie|mande)\s*(na|no|aqui|pelo|pela|mensagem)?\s*\S*',
            '', clean, flags=re.IGNORECASE
        )
        clean = clean.replace('|', ' ')
        first = re.split(r'[.!?\n]+', clean)[0].strip()
        first = re.sub(r'\s+', ' ', first).strip()
        if len(first) > 5:
            parts.append(first)

    result = '. '.join(parts)
    return result[:200] if len(result) > 200 else result


def get_db_connection():
    """Create direct PostgreSQL connection."""
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASS,
        options="-c statement_timeout=300000"  # 5min per statement
    )


def fetch_pending(conn, limit: int) -> List[Dict]:
    """Fetch leads needing D2P embedding via direct SQL."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT il.id, il.profession, il.business_category, il.bio
            FROM instagram_leads il
            JOIN lead_embedding_components lec ON lec.lead_id = il.id
            WHERE il.d2p_processed_at IS NULL
              AND lec.embedding_bio IS NOT NULL
            ORDER BY il.id
            LIMIT %s
        """, (limit,))
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, row)) for row in cur.fetchall()]


UPSERT_CHUNK = 10  # rows per INSERT (vectors are ~6KB each)


def batch_upsert_embeddings(conn, rows: List[Tuple]):
    """Batch upsert embeddings in small chunks (vectors are large)."""
    if not rows:
        return
    for i in range(0, len(rows), UPSERT_CHUNK):
        chunk = rows[i:i + UPSERT_CHUNK]
        with conn.cursor() as cur:
            execute_values(
                cur,
                """
                INSERT INTO lead_embedding_d2p (lead_id, embedding_d2p, embedding_d2p_text)
                VALUES %s
                ON CONFLICT (lead_id)
                DO UPDATE SET
                    embedding_d2p = EXCLUDED.embedding_d2p,
                    embedding_d2p_text = EXCLUDED.embedding_d2p_text
                """,
                chunk,
                template="(%s, %s::vector, %s)"
            )
        conn.commit()


def batch_mark_processed(conn, lead_ids: List[str]):
    """Mark leads as D2P processed in batch."""
    if not lead_ids:
        return
    with conn.cursor() as cur:
        execute_values(
            cur,
            """
            UPDATE instagram_leads
            SET d2p_processed_at = NOW()
            WHERE id IN (VALUES %s)
            """,
            [(lid,) for lid in lead_ids],
            template="(%s::uuid)"
        )
    conn.commit()


def main():
    parser = argparse.ArgumentParser(description="Rebuild D2P embeddings (fast)")
    parser.add_argument("--batch-size", type=int, default=500, help="Texts per OpenAI call")
    parser.add_argument("--page-size", type=int, default=2000, help="DB fetch page size")
    parser.add_argument("--limit", type=int, default=0, help="Max leads (0=all)")
    args = parser.parse_args()

    conn = get_db_connection()
    openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

    total_processed = 0
    total_embedded = 0
    total_skipped = 0
    total_errors = 0
    start_time = time.time()

    print(f"[Rebuild-FAST] Starting (batch={args.batch_size}, page={args.page_size})")
    print(f"[Rebuild-FAST] Direct PostgreSQL connection")

    while True:
        leads = fetch_pending(conn, args.page_size)
        if not leads:
            break

        # Build D2P texts
        items = []
        for lead in leads:
            text = build_d2p_text(lead.get('profession'), lead.get('business_category'), lead.get('bio'))
            items.append({"lead_id": lead["id"], "d2p_text": text})

        # Process in embedding batches
        for batch_start in range(0, len(items), args.batch_size):
            batch = items[batch_start:batch_start + args.batch_size]

            with_text = [it for it in batch if it["d2p_text"]]
            without_text = [it for it in batch if not it["d2p_text"]]

            upsert_rows = []

            if with_text:
                texts = [it["d2p_text"] for it in with_text]
                try:
                    resp = openai_client.embeddings.create(
                        model="text-embedding-3-small",
                        input=texts
                    )
                    embeddings = [d.embedding for d in resp.data]

                    for it, emb in zip(with_text, embeddings):
                        upsert_rows.append((it["lead_id"], emb, it["d2p_text"]))

                    total_embedded += len(with_text)

                except Exception as e:
                    print(f"  [ERR] OpenAI batch: {e}", file=sys.stderr)
                    total_errors += len(with_text)

            total_skipped += len(without_text)

            # Batch upsert all embeddings at once
            if upsert_rows:
                try:
                    batch_upsert_embeddings(conn, upsert_rows)
                except Exception as e:
                    print(f"  [ERR] Batch upsert: {e}", file=sys.stderr)
                    total_errors += len(upsert_rows)
                    total_embedded -= len(upsert_rows)
                    conn.rollback()

            # Mark all as processed
            all_ids = [it["lead_id"] for it in batch]
            try:
                batch_mark_processed(conn, all_ids)
            except Exception as e:
                print(f"  [ERR] Mark processed: {e}", file=sys.stderr)
                conn.rollback()

            total_processed += len(batch)

            elapsed = time.time() - start_time
            rate = total_processed / elapsed if elapsed > 0 else 0
            remaining = (27159 - total_processed) / rate if rate > 0 else 0
            print(f"[Rebuild-FAST] {total_processed} processed | {total_embedded} embedded | "
                  f"{total_skipped} skipped | {total_errors} errors | "
                  f"{rate:.0f} leads/s | {elapsed:.0f}s | ETA: {remaining/60:.1f}min")

            if args.limit and total_processed >= args.limit:
                break

        if args.limit and total_processed >= args.limit:
            break

    conn.close()

    elapsed = time.time() - start_time
    print(f"\n[Rebuild-FAST] === COMPLETE ===")
    print(f"[Rebuild-FAST] Processed: {total_processed}")
    print(f"[Rebuild-FAST] Embedded: {total_embedded}")
    print(f"[Rebuild-FAST] Skipped: {total_skipped}")
    print(f"[Rebuild-FAST] Errors: {total_errors}")
    print(f"[Rebuild-FAST] Time: {elapsed/60:.1f} min")


if __name__ == "__main__":
    main()

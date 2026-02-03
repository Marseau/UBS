#!/usr/bin/env python3
"""
Recompute Final Embeddings via direct PostgreSQL connection (psycopg2 + numpy).

Much faster than REST API: no 8s timeout, binary protocol, server-side cursors.

Formula:
  embedding_final = l2_normalize(0.40*d2p + 0.25*bio + 0.20*website + 0.15*hashtags)
  (weights normalized when components are missing)

Usage:
  python scripts/recompute_final_direct.py [--batch-size 500] [--limit 0]
"""

import os
import sys
import time
import argparse

try:
    import numpy as np
    import psycopg2
    import psycopg2.extras
    from dotenv import load_dotenv
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    print("Install: pip install numpy psycopg2-binary python-dotenv", file=sys.stderr)
    sys.exit(1)

load_dotenv()

WEIGHTS = {'d2p': 0.40, 'bio': 0.25, 'website': 0.20, 'hashtags': 0.15}
DIMS = 1536


def get_conn():
    project_ref = "qsdfyffuonywmtnlycri"
    password = os.getenv("SUPABASE_DB_PASSWORD", "Mbf313500Mbf")
    # Direct connection to Supabase Postgres
    dsn = f"postgresql://postgres.{project_ref}:{password}@aws-0-us-east-1.pooler.supabase.com:6543/postgres"
    conn = psycopg2.connect(dsn)
    conn.autocommit = False
    # Set generous statement timeout (10 min)
    with conn.cursor() as cur:
        cur.execute("SET statement_timeout = '600000'")
    conn.commit()
    return conn


def parse_vector(val) -> np.ndarray | None:
    """Parse a pgvector string like '[0.1,0.2,...]' into numpy array."""
    if val is None:
        return None
    if isinstance(val, str):
        # pgvector returns '[0.1,0.2,...]'
        val = val.strip('[]')
        return np.fromstring(val, sep=',', dtype=np.float64)
    if isinstance(val, (list, tuple)):
        return np.array(val, dtype=np.float64)
    return None


def l2_normalize(v: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(v)
    return v / norm if norm > 1e-10 else v


def compute_final(bio, website, hashtags, d2p) -> np.ndarray | None:
    result = np.zeros(DIMS, dtype=np.float64)
    total_weight = 0.0

    for vec, key in [(d2p, 'd2p'), (bio, 'bio'), (website, 'website'), (hashtags, 'hashtags')]:
        if vec is not None:
            result += WEIGHTS[key] * vec
            total_weight += WEIGHTS[key]

    if total_weight < 1e-10:
        return None

    return l2_normalize(result / total_weight)


def run_vacuum(conn):
    """Run VACUUM on both tables using a separate autocommit connection."""
    old_autocommit = conn.autocommit
    conn.commit()  # flush any pending transaction
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            t0 = time.time()
            cur.execute("VACUUM lead_embedding_final")
            cur.execute("VACUUM lead_embedding_components")
            print(f"[Final-Direct] VACUUM done in {time.time()-t0:.1f}s")
    finally:
        conn.autocommit = old_autocommit


VACUUM_EVERY = 5  # batches


def main():
    parser = argparse.ArgumentParser(description="Recompute final embeddings (direct DB)")
    parser.add_argument("--batch-size", type=int, default=500)
    parser.add_argument("--limit", type=int, default=0, help="Max leads (0=all)")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    conn = get_conn()
    print(f"[Final-Direct] Connected. Starting (batch={args.batch_size}, limit={args.limit or 'all'})")

    processed = 0
    errors = 0
    batch_num = 0

    while True:
        if args.limit and processed >= args.limit:
            break

        batch_limit = args.batch_size
        if args.limit:
            batch_limit = min(batch_limit, args.limit - processed)

        try:
            with conn.cursor() as cur:
                # Fetch batch: components + D2P in one query via LEFT JOIN
                cur.execute("""
                    SELECT
                        lec.lead_id,
                        lec.embedding_bio::text,
                        lec.embedding_website::text,
                        lec.embedding_hashtags::text,
                        led.embedding_d2p::text
                    FROM lead_embedding_components lec
                    LEFT JOIN lead_embedding_d2p led ON led.lead_id = lec.lead_id
                    WHERE lec.needs_final_recompute = TRUE
                      AND (lec.embedding_bio IS NOT NULL
                        OR lec.embedding_website IS NOT NULL
                        OR lec.embedding_hashtags IS NOT NULL)
                    LIMIT %s
                """, (batch_limit,))

                rows = cur.fetchall()

            if not rows:
                break

            batch_num += 1

            # Compute embeddings locally
            results = []
            lead_ids = []
            for lead_id, bio_s, web_s, hash_s, d2p_s in rows:
                bio = parse_vector(bio_s)
                website = parse_vector(web_s)
                hashtags = parse_vector(hash_s)
                d2p = parse_vector(d2p_s)

                final = compute_final(bio, website, hashtags, d2p)
                lead_ids.append(lead_id)
                if final is not None:
                    # Format as pgvector string
                    vec_str = '[' + ','.join(f'{x:.8f}' for x in final) + ']'
                    results.append((lead_id, vec_str))

            if args.dry_run:
                print(f"[Final-Direct] Batch {batch_num}: {len(rows)} read, {len(results)} computed (dry-run)")
                processed += len(rows)
                continue

            # Upsert finals
            with conn.cursor() as cur:
                psycopg2.extras.execute_values(
                    cur,
                    """
                    INSERT INTO lead_embedding_final (lead_id, embedding_final, computed_at)
                    VALUES %s
                    ON CONFLICT (lead_id) DO UPDATE SET
                        embedding_final = EXCLUDED.embedding_final,
                        computed_at = EXCLUDED.computed_at
                    """,
                    [(lid, vec) for lid, vec in results],
                    template="(%s, %s::vector, now())",
                    page_size=500
                )

                # Clear flags
                psycopg2.extras.execute_values(
                    cur,
                    """
                    UPDATE lead_embedding_components AS lec SET
                        needs_final_recompute = FALSE,
                        embedded_at = NOW(),
                        updated_at = NOW()
                    FROM (VALUES %s) AS v(lid)
                    WHERE lec.lead_id = v.lid::uuid
                    """,
                    [(lid,) for lid in lead_ids],
                    page_size=500
                )

            conn.commit()
            processed += len(rows)
            print(f"[Final-Direct] Batch {batch_num}: {len(results)}/{len(rows)} computed+saved (total={processed})")

            # Periodic VACUUM to prevent dead tuple degradation
            if batch_num % VACUUM_EVERY == 0:
                run_vacuum(conn)

        except Exception as e:
            errors += len(rows) if 'rows' in dir() else 0
            print(f"[Final-Direct] ERROR batch {batch_num}: {e}", file=sys.stderr)
            try:
                conn.rollback()
            except Exception:
                pass
            # Reconnect if connection lost
            try:
                conn.close()
            except Exception:
                pass
            print("[Final-Direct] Reconnecting...", file=sys.stderr)
            time.sleep(5)
            try:
                conn = get_conn()
                print("[Final-Direct] Reconnected.")
            except Exception as e2:
                print(f"[Final-Direct] FATAL: cannot reconnect: {e2}", file=sys.stderr)
                break

    conn.close()
    print(f"\n[Final-Direct] === {'DRY RUN ' if args.dry_run else ''}COMPLETE ===")
    print(f"[Final-Direct] Processed: {processed}")
    print(f"[Final-Direct] Errors: {errors}")


if __name__ == "__main__":
    main()

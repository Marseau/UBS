#!/usr/bin/env python3
"""
Migrate data from lead_embeddings to 3 new tables.
Uses direct PostgreSQL for speed (bypasses Supabase MCP timeout).
"""

import sys
import time

try:
    import psycopg2
    from psycopg2.extras import execute_values
except ImportError:
    print("pip install psycopg2-binary", file=sys.stderr)
    sys.exit(1)

DB_HOST = "db.qsdfyffuonywmtnlycri.supabase.co"
DB_PORT = 5432
DB_NAME = "postgres"
DB_USER = "postgres"
DB_PASS = "Mbf313500Mbf"

BATCH = 2000


def get_conn():
    return psycopg2.connect(
        host=DB_HOST, port=DB_PORT, dbname=DB_NAME,
        user=DB_USER, password=DB_PASS,
        options="-c statement_timeout=1800000"  # 30 min
    )


def log(msg):
    print(msg, flush=True)


def migrate_final(conn):
    """Migrate remaining embedding_final rows."""
    # Drop HNSW index for fast bulk insert, recreate after
    with conn.cursor() as cur:
        cur.execute("DROP INDEX IF EXISTS idx_lef_hnsw;")
        cur.execute("ALTER TABLE lead_embedding_final DISABLE TRIGGER trg_sync_final;")
    conn.commit()
    log("[final] Dropped HNSW index + disabled trigger")

    total = 0
    while True:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO lead_embedding_final (lead_id, embedding_final, computed_at)
                SELECT le.lead_id, le.embedding_final, COALESCE(le.updated_at, le.created_at)
                FROM lead_embeddings le
                LEFT JOIN lead_embedding_final lef ON lef.lead_id = le.lead_id
                WHERE le.embedding_final IS NOT NULL
                  AND lef.lead_id IS NULL
                ORDER BY le.lead_id
                LIMIT %s
            """, (BATCH,))
            inserted = cur.rowcount
        conn.commit()
        total += inserted
        log(f"[final] {total} migrated (+{inserted})")
        if inserted < BATCH:
            break

    # Recreate HNSW index
    log("[final] Recreating HNSW index (this takes a few minutes)...")
    with conn.cursor() as cur:
        cur.execute("""
            CREATE INDEX idx_lef_hnsw ON lead_embedding_final
                USING hnsw (embedding_final vector_cosine_ops)
                WITH (m = 16, ef_construction = 64);
        """)
        cur.execute("ALTER TABLE lead_embedding_final ENABLE TRIGGER trg_sync_final;")
    conn.commit()
    log(f"[final] COMPLETE: {total} rows. HNSW + trigger restored.")
    return total


def migrate_d2p(conn):
    """Migrate embedding_d2p rows."""
    # Drop HNSW for speed
    with conn.cursor() as cur:
        cur.execute("DROP INDEX IF EXISTS idx_led2p_hnsw;")
    conn.commit()
    log("[d2p] Dropped HNSW index")

    total = 0
    while True:
        with conn.cursor() as cur:
            cur.execute("""
                INSERT INTO lead_embedding_d2p (lead_id, embedding_d2p, embedding_d2p_text)
                SELECT le.lead_id, le.embedding_d2p, le.embedding_d2p_text
                FROM lead_embeddings le
                LEFT JOIN lead_embedding_d2p led ON led.lead_id = le.lead_id
                WHERE le.embedding_d2p IS NOT NULL
                  AND led.lead_id IS NULL
                ORDER BY le.lead_id
                LIMIT %s
            """, (BATCH,))
            inserted = cur.rowcount
        conn.commit()
        total += inserted
        log(f"[d2p] {total} migrated (+{inserted})")
        if inserted < BATCH:
            break

    # Recreate HNSW
    log("[d2p] Recreating HNSW index...")
    with conn.cursor() as cur:
        cur.execute("""
            CREATE INDEX idx_led2p_hnsw ON lead_embedding_d2p
                USING hnsw (embedding_d2p vector_cosine_ops)
                WITH (m = 16, ef_construction = 64);
        """)
    conn.commit()
    log(f"[d2p] COMPLETE: {total} rows. HNSW restored.")
    return total


def verify(conn):
    """Verify migration counts."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT
                (SELECT COUNT(*) FROM lead_embeddings) AS old_total,
                (SELECT COUNT(*) FROM lead_embeddings WHERE embedding_final IS NOT NULL) AS old_final,
                (SELECT COUNT(*) FROM lead_embeddings WHERE embedding_d2p IS NOT NULL) AS old_d2p,
                (SELECT COUNT(*) FROM lead_embedding_components) AS new_components,
                (SELECT COUNT(*) FROM lead_embedding_final) AS new_final,
                (SELECT COUNT(*) FROM lead_embedding_d2p) AS new_d2p
        """)
        row = cur.fetchone()
        cols = [d[0] for d in cur.description]
        result = dict(zip(cols, row))

    print("\n=== VERIFICATION ===")
    for k, v in result.items():
        print(f"  {k}: {v}")

    ok = True
    if result['old_total'] != result['new_components']:
        print(f"  WARNING: components mismatch ({result['old_total']} vs {result['new_components']})")
        ok = False
    if result['old_final'] != result['new_final']:
        print(f"  WARNING: final mismatch ({result['old_final']} vs {result['new_final']})")
        ok = False
    if result['old_d2p'] != result['new_d2p']:
        print(f"  WARNING: d2p mismatch ({result['old_d2p']} vs {result['new_d2p']})")
        ok = False

    if ok:
        print("  ALL COUNTS MATCH!")
    return ok


def main():
    conn = get_conn()
    start = time.time()

    print("=== Migrating lead_embedding_final ===")
    migrate_final(conn)

    print("\n=== Migrating lead_embedding_d2p ===")
    migrate_d2p(conn)

    print(f"\nTotal time: {(time.time() - start)/60:.1f} min")

    verify(conn)
    conn.close()


if __name__ == "__main__":
    main()

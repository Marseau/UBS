"""
Bulk D2P Embedding Script
Gera embeddings D2P para leads que têm profession E business_category.
Usa psycopg2 direto no Postgres (sem timeout de REST API).

Uso: python scripts/bulk_d2p_embeddings.py
"""

import os
import re
import json
import time
import requests
import psycopg2
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

HEADERS_OPENAI = {
    "Authorization": f"Bearer {OPENAI_API_KEY}",
    "Content-Type": "application/json",
}

PG_DSN = {
    "host": "db.qsdfyffuonywmtnlycri.supabase.co",
    "port": 5432,
    "dbname": "postgres",
    "user": "postgres",
    "password": "Mbf313500Mbf",
}

FETCH_BATCH = 500
EMBED_BATCH = 2000
UPDATE_BATCH = 100


def clean_bio(bio: str) -> str:
    """Mesma lógica de limpeza do workflow N8N."""
    if not bio:
        return ""
    clean = bio
    lines = clean.split("\n")
    if len(lines) > 1 and len(lines[0].strip()) < 50:
        lines.pop(0)
        clean = "\n".join(lines)
    clean = re.sub(
        r"[\U0001F600-\U0001F64F\U0001F300-\U0001F5FF\U0001F680-\U0001F6FF"
        r"\U0001F1E0-\U0001F1FF\u2702-\u27B0\u24C2-\U0001F251"
        r"\U0001F900-\U0001F9FF\U0001FA00-\U0001FA6F\U0001FA70-\U0001FAFF"
        r"\u2600-\u26FF\uFE00-\uFE0F\u200D]",
        "",
        clean,
    )
    clean = re.sub(r"https?://\S+", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"www\.\S+", "", clean, flags=re.IGNORECASE)
    clean = re.sub(r"\(?\d{2}\)?\s*\d{4,5}[-.\s]?\d{4}", "", clean)
    clean = re.sub(
        r"(clique|link|acesse|saiba mais|fale conosco|agende|whatsapp|dm|direct|inbox|entre em contato|envie|mande)\s*(na|no|aqui|pelo|pela|mensagem)?\s*\S*",
        "",
        clean,
        flags=re.IGNORECASE,
    )
    clean = clean.replace("|", " ")
    parts = re.split(r"[.!?\n]+", clean)
    clean = (parts[0] if parts else "").strip()
    clean = re.sub(r"\s+", " ", clean).strip()
    return clean if len(clean) > 5 else ""


def build_d2p_text(profession: str, business_category: str, bio: str) -> str:
    """profession. business_category. bio_limpa"""
    generic_cats = ["outros", "other", ""]
    txt = ""
    cat = (business_category or "").lower()

    if not profession and cat in generic_cats:
        return ""

    if profession:
        txt = profession
    if business_category and cat not in generic_cats:
        txt = f"{txt}. {business_category}" if txt else business_category

    clean = clean_bio(bio)
    if clean:
        txt = f"{txt}. {clean}" if txt else clean

    if len(txt) > 200:
        txt = txt[:200]

    return txt


def get_embeddings(texts: list) -> list:
    """Chama OpenAI embeddings API com batch de textos."""
    resp = requests.post(
        "https://api.openai.com/v1/embeddings",
        headers=HEADERS_OPENAI,
        json={"model": "text-embedding-3-small", "input": texts},
        timeout=120,
    )
    if resp.status_code != 200:
        print(f"  OpenAI error: {resp.status_code} {resp.text[:200]}")
        return []
    data = resp.json()
    return [item["embedding"] for item in data["data"]]


def main():
    print("=" * 60)
    print("BULK D2P EMBEDDING SCRIPT (psycopg2 direto)")
    print("=" * 60)

    conn = psycopg2.connect(**PG_DSN)
    conn.autocommit = False
    cur = conn.cursor()
    cur.execute("SET statement_timeout = '300s'")
    conn.commit()

    # Conta total
    cur.execute("""
        SELECT COUNT(*)
        FROM lead_embedding_d2p led
        RIGHT JOIN instagram_leads il ON il.id = led.lead_id
        JOIN lead_embedding_final lef ON lef.lead_id = il.id
        WHERE led.embedding_d2p IS NULL
          AND lef.embedding_final IS NOT NULL
          AND il.profession IS NOT NULL
          AND il.business_category IS NOT NULL
    """)
    total_count = cur.fetchone()[0]
    print(f"\nTotal leads com profession+business_category sem D2P: {total_count}")

    total_embedded = 0
    batch_num = 0

    while True:
        batch_num += 1
        print(f"\n{'='*60}")
        print(f"BATCH {batch_num} | Embedded: {total_embedded}/{total_count}")
        print(f"{'='*60}")

        # Busca leads que precisam de D2P (com profession E business_category)
        cur.execute("""
            SELECT il.id, il.profession, il.business_category, il.bio
            FROM instagram_leads il
            JOIN lead_embedding_final lef ON lef.lead_id = il.id
            LEFT JOIN lead_embedding_d2p led ON led.lead_id = il.id
            WHERE led.embedding_d2p IS NULL
              AND lef.embedding_final IS NOT NULL
              AND il.profession IS NOT NULL
              AND il.business_category IS NOT NULL
            ORDER BY il.id
            LIMIT %s
        """, (FETCH_BATCH,))
        rows = cur.fetchall()

        if not rows:
            print("  Nenhum lead restante. Finalizado!")
            break

        print(f"  Buscados {len(rows)} leads")

        # Build d2p_text
        texts_to_embed = []
        leads_with_text = []
        for lead_id, profession, business_category, bio in rows:
            d2p_text = build_d2p_text(profession, business_category, bio or "")
            if not d2p_text:
                continue
            texts_to_embed.append(d2p_text)
            leads_with_text.append({"lead_id": str(lead_id), "d2p_text": d2p_text})

        if not texts_to_embed:
            print("  Nenhum texto válido neste batch")
            continue

        print(f"  Textos para embedar: {len(texts_to_embed)}")

        # OpenAI embeddings
        all_embeddings = []
        for i in range(0, len(texts_to_embed), EMBED_BATCH):
            sub = texts_to_embed[i:i + EMBED_BATCH]
            print(f"  OpenAI {i+1}-{i+len(sub)} de {len(texts_to_embed)}...", end=" ", flush=True)
            t0 = time.time()
            embs = get_embeddings(sub)
            elapsed = time.time() - t0
            if not embs:
                print("ERRO!")
                break
            all_embeddings.extend(embs)
            print(f"OK ({elapsed:.1f}s)")

        if len(all_embeddings) != len(leads_with_text):
            print(f"  ERRO: embeddings ({len(all_embeddings)}) != leads ({len(leads_with_text)})")
            continue

        # UPDATE direto via unnest com commit por sub-batch
        print(f"  Updating {len(leads_with_text)} embeddings...")
        t0 = time.time()
        upsert_ok = 0
        for i in range(0, len(leads_with_text), UPDATE_BATCH):
            sub_leads = leads_with_text[i:i + UPDATE_BATCH]
            sub_embs = all_embeddings[i:i + UPDATE_BATCH]
            ids = [l["lead_id"] for l in sub_leads]
            emb_strs = [json.dumps(sub_embs[j]) for j in range(len(sub_leads))]
            txts = [l["d2p_text"] for l in sub_leads]

            try:
                cur.execute("""
                    INSERT INTO lead_embedding_d2p (lead_id, embedding_d2p, embedding_d2p_text)
                    SELECT v.lid, v.emb::vector, v.txt
                    FROM (SELECT unnest(%s::uuid[]) AS lid,
                                 unnest(%s::vector[]) AS emb,
                                 unnest(%s::text[]) AS txt) v
                    ON CONFLICT (lead_id) DO UPDATE SET
                        embedding_d2p = EXCLUDED.embedding_d2p,
                        embedding_d2p_text = EXCLUDED.embedding_d2p_text
                """, (ids, emb_strs, txts))
                # Mark d2p_processed_at para este sub-batch
                cur.execute(
                    "UPDATE instagram_leads SET d2p_processed_at = NOW(), updated_at = updated_at "
                    "WHERE id = ANY(%s::uuid[])",
                    (ids,)
                )
                conn.commit()
                upsert_ok += len(sub_leads)
                print(f"    {upsert_ok}/{len(leads_with_text)}", end=" ", flush=True)
            except Exception as e:
                conn.rollback()
                print(f"\n    ERRO sub-batch {i}: {str(e)[:100]}")
                # Reconecta
                try:
                    cur.close()
                    conn.close()
                except Exception:
                    pass
                conn = psycopg2.connect(**PG_DSN)
                conn.autocommit = False
                cur = conn.cursor()
                cur.execute("SET statement_timeout = '300s'")
                conn.commit()

        elapsed = time.time() - t0
        total_embedded += upsert_ok
        print(f"\n  Batch OK: {upsert_ok} rows, {elapsed:.1f}s")

        time.sleep(0.3)

    cur.close()
    conn.close()

    print(f"\n{'='*60}")
    print(f"FINALIZADO!")
    print(f"Total embedded: {total_embedded}")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

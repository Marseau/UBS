#!/usr/bin/env python3
"""
Export lead_embedding_final to Parquet for batch vector similarity.

Exports:
- lead_id, username, bio, profession
- embedding_final (1536 dims)

Run daily via cron or before D2P analysis.
"""

import os
import sys
import json
import numpy as np
import pandas as pd
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

try:
    from supabase import create_client
except ImportError:
    print("Install: pip install supabase")
    sys.exit(1)

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "..", "data")
BATCH_SIZE = 1000


def export_to_parquet():
    """Export lead_embedding_final to Parquet file."""
    print(f"[EXPORT] Connecting to Supabase...")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

    # Step 1: Get all lead_ids and embeddings (faster without join)
    print(f"[EXPORT] Step 1: Fetching embeddings...")
    embeddings_data = []
    offset = 0

    while True:
        response = supabase.table('lead_embedding_final').select(
            'lead_id, embedding_final'
        ).not_.is_('embedding_final', 'null').range(
            offset, offset + BATCH_SIZE - 1
        ).execute()

        if not response.data:
            break

        embeddings_data.extend(response.data)

        if len(embeddings_data) % 10000 == 0:
            print(f"[EXPORT] Fetched {len(embeddings_data)} embeddings...")

        if len(response.data) < BATCH_SIZE:
            break

        offset += BATCH_SIZE

        if offset > 100000:
            break

    print(f"[EXPORT] Total embeddings: {len(embeddings_data)}")

    if not embeddings_data:
        print("[EXPORT] No data found!")
        return None

    # Extract lead_ids
    lead_ids = [row['lead_id'] for row in embeddings_data]

    # Step 2: Get metadata for all leads (batch by lead_id)
    print(f"[EXPORT] Step 2: Fetching metadata...")
    metadata_map = {}

    for i in range(0, len(lead_ids), 500):
        batch_ids = lead_ids[i:i+500]
        response = supabase.table('instagram_leads').select(
            'id, username, bio, profession'
        ).in_('id', batch_ids).execute()

        for row in response.data:
            metadata_map[row['id']] = row

        if (i + 500) % 10000 == 0:
            print(f"[EXPORT] Fetched metadata for {i + 500} leads...")

    print(f"[EXPORT] Total metadata: {len(metadata_map)}")

    # Step 3: Combine and save
    print(f"[EXPORT] Step 3: Processing...")

    rows = []
    embeddings = []

    for emb_row in embeddings_data:
        lead_id = emb_row['lead_id']
        emb = emb_row.get('embedding_final')

        if emb is None or lead_id not in metadata_map:
            continue

        meta = metadata_map[lead_id]

        # Parse embedding
        if isinstance(emb, str):
            emb = [float(x) for x in emb.strip('[]').split(',')]

        rows.append({
            'lead_id': lead_id,
            'username': meta.get('username'),
            'bio': meta.get('bio'),
            'profession': meta.get('profession')
        })
        embeddings.append(emb)

    # Create DataFrame
    df = pd.DataFrame(rows)
    embeddings_array = np.array(embeddings, dtype=np.float32)

    # Save
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    parquet_path = os.path.join(OUTPUT_DIR, "lead_embeddings.parquet")
    embeddings_path = os.path.join(OUTPUT_DIR, "lead_embeddings.npy")

    df.to_parquet(parquet_path, index=False)
    np.save(embeddings_path, embeddings_array)

    print(f"[EXPORT] Saved {len(df)} leads to:")
    print(f"         - {parquet_path} ({os.path.getsize(parquet_path) / 1024 / 1024:.1f} MB)")
    print(f"         - {embeddings_path} ({os.path.getsize(embeddings_path) / 1024 / 1024:.1f} MB)")

    # Save metadata
    meta = {
        'count': len(df),
        'embedding_dim': embeddings_array.shape[1] if len(embeddings_array) > 0 else 0,
        'exported_at': datetime.now().isoformat()
    }

    with open(os.path.join(OUTPUT_DIR, "export_meta.json"), 'w') as f:
        json.dump(meta, f, indent=2)

    return parquet_path


if __name__ == '__main__':
    export_to_parquet()

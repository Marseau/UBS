#!/usr/bin/env python3
"""
Enrich Profession via GPT-4o-mini

Classifies `profession` and corrects `business_category` for leads that have
bio and/or search_term_used but no profession assigned.

Uses GPT-4o-mini with structured output for high accuracy at minimal cost.
After updating instagram_leads, the existing DB trigger automatically
regenerates embedding_d2p via Edge Function.

Usage:
  python scripts/enrich_profession_gpt.py [--batch-size 20] [--limit 0] [--dry-run] [--offset 0]

Cost estimate: ~$0.60-1.00 USD for 34k leads (GPT-4o-mini)
"""

import os
import sys
import json
import time
import argparse
from typing import List, Dict, Any, Optional

try:
    from openai import OpenAI
    from supabase import create_client, Client
    from dotenv import load_dotenv
except ImportError as e:
    print(f"Missing dependency: {e}", file=sys.stderr)
    print("Install: pip install openai supabase python-dotenv", file=sys.stderr)
    sys.exit(1)

load_dotenv()

DEFAULT_BATCH_SIZE = 20  # GPT calls per batch (each call = 1 lead)
PAGE_SIZE = 500
RATE_LIMIT_DELAY_MS = 100
MODEL = "gpt-4o-mini"

SYSTEM_PROMPT = """Você é um classificador de perfis profissionais do Instagram.
Dado a bio, categoria atual e termo de busca de um perfil, determine:

1. **profession**: A profissão ou tipo de negócio específico (ex: "Dentista", "Restaurante", "Cabeleireiro", "Agência de Marketing", "Personal Trainer", "Contador", "Advogado", "Confeitaria", "Loja de Roupas", "Imobiliária", etc.)
2. **business_category**: A categoria de negócio corrigida. Use uma dessas: beleza, saude, fitness, alimentacao, juridico, consultoria, educacao, tecnologia, financeiro, imobiliario, moda, pet, automotivo, construcao, eventos, comunicacao, agricultura, industria, varejo, servicos, outros

Regras:
- profession deve ser ESPECÍFICO (não genérico como "Empresário" ou "Empreendedor")
- Use SEMPRE a forma masculina e Title Case (ex: "Advogado", não "Advogada"; "Psicólogo", não "Psicóloga"; "Fotógrafo", não "Fotógrafa"; "Confeiteiro", não "Confeiteira"; "Arquiteto", não "Arquiteta")
- Se a bio indica claramente o tipo de negócio, use isso
- Se não conseguir determinar uma profissão específica, retorne null para profession
- business_category deve ser uma das categorias listadas acima
- Responda APENAS com JSON válido, sem markdown"""

USER_TEMPLATE = """Bio: {bio}
Categoria atual: {category}
Termo de busca: {search_term}

Retorne JSON: {{"profession": "...", "business_category": "..."}}"""


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


def fetch_leads_page(supabase: Client, offset: int) -> List[Dict[str, Any]]:
    """Fetch a page of leads without profession that have bio or search_term."""
    result = supabase.from_("instagram_leads").select(
        "id, username, bio, business_category, search_term_used"
    ).is_(
        "profession", "null"
    ).not_.is_(
        "bio", "null"
    ).order("id").range(offset, offset + PAGE_SIZE - 1).execute()

    return result.data or []


def classify_lead(openai_client: OpenAI, lead: Dict[str, Any]) -> Optional[Dict[str, str]]:
    """Classify a single lead using GPT-4o-mini."""
    bio = (lead.get('bio') or '')[:300]
    category = lead.get('business_category') or 'desconhecido'
    search_term = lead.get('search_term_used') or 'nenhum'

    try:
        response = openai_client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": USER_TEMPLATE.format(
                    bio=bio, category=category, search_term=search_term
                )}
            ],
            temperature=0.1,
            max_tokens=100
        )

        content = response.choices[0].message.content.strip()
        # Remove markdown code fences if present
        if content.startswith('```'):
            content = content.split('\n', 1)[1] if '\n' in content else content[3:]
            if content.endswith('```'):
                content = content[:-3]
            content = content.strip()

        result = json.loads(content)
        profession = result.get('profession')
        business_category = result.get('business_category')

        # Validate
        if profession and isinstance(profession, str) and len(profession) > 1:
            return {
                'profession': profession[:100],
                'business_category': business_category or category
            }
        return None

    except (json.JSONDecodeError, KeyError, IndexError) as e:
        print(f"  [WARN] Parse error for @{lead.get('username', '?')}: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"  [ERROR] GPT call for @{lead.get('username', '?')}: {e}", file=sys.stderr)
        return None


def update_lead(supabase: Client, lead_id: str, profession: str, business_category: str):
    """Update profession and business_category in instagram_leads."""
    for attempt in range(3):
        try:
            supabase.from_("instagram_leads").update({
                "profession": profession,
                "business_category": business_category
            }).eq("id", lead_id).execute()
            return True
        except Exception as e:
            if attempt < 2:
                time.sleep(1)
            else:
                print(f"  [ERROR] Update failed for {lead_id}: {e}", file=sys.stderr)
                return False


def main():
    parser = argparse.ArgumentParser(description="Enrich profession via GPT-4o-mini")
    parser.add_argument("--batch-size", type=int, default=DEFAULT_BATCH_SIZE,
                        help="Leads per processing cycle (default: 20)")
    parser.add_argument("--limit", type=int, default=0, help="Max leads to process (0=all)")
    parser.add_argument("--offset", type=int, default=0, help="Start offset for pagination")
    parser.add_argument("--dry-run", action="store_true", help="Show classifications without saving")
    args = parser.parse_args()

    supabase, openai_client = get_clients()

    processed = 0
    classified = 0
    skipped = 0
    errors = 0
    offset = args.offset

    print(f"[Enrich] Starting (batch={args.batch_size}, limit={args.limit or 'all'}, offset={offset})")
    print(f"[Enrich] Model: {MODEL}")
    if args.dry_run:
        print("[Enrich] *** DRY RUN - no updates will be saved ***")

    while True:
        # Fetch page
        leads = fetch_leads_page(supabase, offset)
        if not leads:
            break
        offset += PAGE_SIZE

        for lead in leads:
            if args.limit and processed >= args.limit:
                break

            processed += 1

            # Skip leads without useful data
            bio = lead.get('bio') or ''
            if len(bio) < 10 and not lead.get('search_term_used'):
                skipped += 1
                continue

            # Classify
            result = classify_lead(openai_client, lead)

            if not result:
                skipped += 1
                continue

            profession = result['profession']
            category = result['business_category']

            if args.dry_run:
                uname = lead.get('username') or '?'
                cat = lead.get('business_category') or '?'
                print(f"  @{uname:25s} | {cat:15s} -> {profession:30s} | {category}")
            else:
                success = update_lead(supabase, lead['id'], profession, category)
                if success:
                    classified += 1
                else:
                    errors += 1

            # Rate limiting
            time.sleep(RATE_LIMIT_DELAY_MS / 1000.0)

            if processed % 100 == 0:
                print(f"[Enrich] Progress: {processed} processed, {classified} classified, "
                      f"{skipped} skipped, {errors} errors")

        if args.limit and processed >= args.limit:
            break

    print(f"\n[Enrich] === {'DRY RUN ' if args.dry_run else ''}COMPLETE ===")
    print(f"[Enrich] Processed: {processed}")
    print(f"[Enrich] Classified: {classified}")
    print(f"[Enrich] Skipped: {skipped}")
    print(f"[Enrich] Errors: {errors}")

    if not args.dry_run and classified > 0:
        print(f"\n[Enrich] NOTE: DB trigger will auto-generate embedding_d2p for updated leads.")
        print(f"[Enrich] This happens asynchronously via Edge Function.")


if __name__ == "__main__":
    main()

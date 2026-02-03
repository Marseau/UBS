#!/usr/bin/env python3
"""
BERTOPIC++ - Market Friction Discovery

Descobre fricções de mercado (não apenas temas) usando BERTopic + regras operacionais.
Pipeline: Segmenta por mercado → BERTopic → Regras de Fricção → Unidades de Fricção

Diferencial:
- BERTopic sozinho: encontra TEMAS ("whatsapp", "leads")
- BERTopic++: encontra FRICÇÕES ("responder manualmente", "qualificar sem critério")

Uso:
    python scripts/market-demand-discovery.py

Autor: AIC Intelligence
"""

import os
import json
import re
import numpy as np
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple
from collections import Counter
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Supabase
from supabase import create_client, Client

# BERTopic and dependencies
from bertopic import BERTopic
from umap import UMAP
from hdbscan import HDBSCAN
from sklearn.feature_extraction.text import CountVectorizer

# Configuration
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")

# Analysis parameters
MIN_CLUSTER_SIZE = 50   # Minimum leads per cluster (per market)
MIN_SAMPLES = 20        # HDBSCAN min_samples
N_NEIGHBORS = 15        # UMAP n_neighbors
N_COMPONENTS = 10       # UMAP output dimensions
MIN_MARKET_SIZE = 200   # Minimum leads to analyze a market
MAX_LEADS_PER_MARKET = 5000  # Limit per market to avoid timeout

print("""
╔═══════════════════════════════════════════════════════════════╗
║       BERTOPIC++ - Market Friction Discovery                  ║
║       Descoberta de Fricções via Clustering + Regras          ║
╚═══════════════════════════════════════════════════════════════╝
""")

# ==================== FRICTION DETECTION RULES ====================

# Rule A: Decision verbs (indicate manual decision-making friction)
DECISION_VERBS = [
    'responder', 'decidir', 'escolher', 'filtrar', 'selecionar', 'priorizar',
    'avaliar', 'analisar', 'classificar', 'qualificar', 'verificar', 'validar',
    'acompanhar', 'monitorar', 'conferir', 'checar', 'organizar', 'separar',
    'atender', 'resolver', 'lidar', 'gerenciar', 'coordenar', 'controlar'
]

# Rule B: Tool + effort patterns (indicate workarounds)
TOOL_EFFORT_PATTERNS = [
    ('whatsapp', ['tempo', 'manual', 'resposta', 'mensagem', 'atendimento']),
    ('planilha', ['controle', 'lead', 'cliente', 'dados', 'manual']),
    ('excel', ['controle', 'lead', 'cliente', 'dados', 'manual']),
    ('crm', ['manual', 'atualizar', 'cadastro', 'registro']),
    ('agenda', ['manual', 'confirmação', 'lembrete', 'horário']),
    ('instagram', ['dm', 'direct', 'mensagem', 'resposta', 'story']),
    ('email', ['resposta', 'manual', 'acompanhamento', 'follow']),
    ('telefone', ['ligar', 'retornar', 'ligação', 'chamada']),
]

# Rule C: Volume + ambiguity patterns (indicate overload)
VOLUME_PATTERNS = [
    'muitos', 'vários', 'diversos', 'todos', 'cada', 'dezenas', 'centenas',
    'diário', 'diariamente', 'sempre', 'constante', 'frequente', 'todo dia'
]

AMBIGUITY_PATTERNS = [
    'qualquer', 'algum', 'qual', 'como', 'quando', 'melhor', 'certo',
    'ideal', 'correto', 'adequado', 'eficiente', 'produtivo'
]

# Friction impact categories
FRICTION_IMPACTS = {
    'decision_overload': 'Sobrecarga decisória - perda de tempo e oportunidades',
    'manual_workaround': 'Workaround manual - ineficiência operacional',
    'volume_chaos': 'Caos de volume - falta de priorização',
    'response_delay': 'Demora na resposta - perda de leads quentes',
    'qualification_gap': 'Falha na qualificação - esforço em leads frios',
    'profession_inferred': 'Fricção inferida por profissão - rotina operacional comum',
}

# PROFESSION-BASED FRICTION INFERENCE
# Since Instagram bios are promotional (what they DO), not operational (their PAIN),
# we infer frictions based on known profession patterns
PROFESSION_FRICTIONS = {
    # Marketing/Vendas
    'gestora tráfego': {
        'friction': 'Gerenciar múltiplos clientes, gerar relatórios, otimizar campanhas',
        'workaround': ['planilha', 'whatsapp grupo'],
        'score_boost': 0.35
    },
    'marketing': {
        'friction': 'Criar conteúdo, agendar posts, responder clientes',
        'workaround': ['agendador', 'whatsapp'],
        'score_boost': 0.30
    },
    'vendas': {
        'friction': 'Prospectar leads, fazer follow-up, qualificar oportunidades',
        'workaround': ['planilha', 'crm manual'],
        'score_boost': 0.40
    },
    'prospecção': {
        'friction': 'Encontrar leads qualificados, sequências de follow-up',
        'workaround': ['linkedin', 'email manual'],
        'score_boost': 0.45
    },
    'b2b': {
        'friction': 'Ciclo de vendas longo, múltiplos decisores, propostas',
        'workaround': ['email', 'reunião'],
        'score_boost': 0.35
    },

    # RH/Recrutamento
    'recrutamento': {
        'friction': 'Triagem de currículos, agendamento de entrevistas, feedback',
        'workaround': ['planilha', 'email', 'whatsapp'],
        'score_boost': 0.40
    },
    'rh': {
        'friction': 'Processos de admissão, comunicação com candidatos',
        'workaround': ['planilha', 'email'],
        'score_boost': 0.35
    },

    # Contabilidade/Financeiro
    'contabilidade': {
        'friction': 'Coleta de documentos, prazos fiscais, comunicação com cliente',
        'workaround': ['email', 'whatsapp', 'drive'],
        'score_boost': 0.35
    },
    'crédito': {
        'friction': 'Análise de documentos, follow-up de propostas, status',
        'workaround': ['whatsapp', 'planilha'],
        'score_boost': 0.30
    },

    # Saúde
    'odontologia': {
        'friction': 'Agendamento, confirmação, faltas, retorno de pacientes',
        'workaround': ['whatsapp', 'agenda manual'],
        'score_boost': 0.40
    },
    'dentista': {
        'friction': 'Agendamento, confirmação, faltas, retorno de pacientes',
        'workaround': ['whatsapp', 'agenda manual'],
        'score_boost': 0.40
    },
    'clínica': {
        'friction': 'Agendamento, confirmação, atendimento ao paciente',
        'workaround': ['whatsapp', 'telefone'],
        'score_boost': 0.35
    },
    'médico': {
        'friction': 'Confirmação de consultas, retorno de exames',
        'workaround': ['secretária', 'whatsapp'],
        'score_boost': 0.30
    },

    # Beleza
    'depilação': {
        'friction': 'Agendamento, confirmação, no-shows, reagendamentos',
        'workaround': ['whatsapp', 'agenda'],
        'score_boost': 0.40
    },
    'cabelo': {
        'friction': 'Agendamento, horários vagos, lembretes',
        'workaround': ['whatsapp', 'instagram dm'],
        'score_boost': 0.35
    },
    'estética': {
        'friction': 'Protocolo de tratamento, retornos, acompanhamento',
        'workaround': ['whatsapp', 'planilha'],
        'score_boost': 0.35
    },

    # Educação
    'professor': {
        'friction': 'Agendamento de aulas, material, acompanhamento alunos',
        'workaround': ['whatsapp', 'google docs'],
        'score_boost': 0.30
    },
    'mentora': {
        'friction': 'Agendamento de calls, material de apoio, follow-up',
        'workaround': ['calendly', 'whatsapp'],
        'score_boost': 0.35
    },
    'coach': {
        'friction': 'Agendamento de sessões, acompanhamento de metas',
        'workaround': ['calendly', 'whatsapp'],
        'score_boost': 0.35
    },

    # Fitness
    'personal': {
        'friction': 'Agendamento de treinos, acompanhamento, substituições',
        'workaround': ['whatsapp', 'planilha'],
        'score_boost': 0.35
    },
    'treino': {
        'friction': 'Montagem de treino, acompanhamento, ajustes',
        'workaround': ['whatsapp', 'app'],
        'score_boost': 0.30
    },

    # Serviços Pet
    'adestramento': {
        'friction': 'Agendamento, acompanhamento do progresso, comunicação dono',
        'workaround': ['whatsapp', 'vídeo'],
        'score_boost': 0.40
    },
    'veterinário': {
        'friction': 'Agendamento, retorno vacinas, emergências',
        'workaround': ['whatsapp', 'agenda'],
        'score_boost': 0.35
    },

    # Jurídico
    'advogado': {
        'friction': 'Atendimento inicial, coleta de documentos, status processo',
        'workaround': ['whatsapp', 'email', 'drive'],
        'score_boost': 0.35
    },
    'escritório advocacia': {
        'friction': 'Triagem de casos, comunicação cliente, prazos',
        'workaround': ['sistema', 'whatsapp'],
        'score_boost': 0.30
    },
}


def detect_friction_type(keywords: List[str], representative_docs: List[str]) -> Dict[str, Any]:
    """
    Apply friction detection rules to a topic.
    Returns friction analysis with type, score, and evidence.

    Rules:
    A) Decision verbs in text
    B) Tool + effort patterns
    C) Volume + ambiguity
    D) Profession-based inference (NEW - most important for Instagram bios)
    """
    all_text = ' '.join(keywords + representative_docs).lower()
    words = set(re.findall(r'\w+', all_text))

    friction_score = 0.0
    detected_verbs = []
    detected_tools = []
    detected_volume = []
    inferred_friction = None
    inferred_workarounds = []

    # Rule D: PROFESSION-BASED INFERENCE (check first - most reliable for bios)
    for profession_key, profession_data in PROFESSION_FRICTIONS.items():
        # Check if profession appears in keywords or text
        if profession_key in all_text or any(profession_key in kw.lower() for kw in keywords):
            friction_score += profession_data['score_boost']
            inferred_friction = profession_data['friction']
            inferred_workarounds = profession_data['workaround']
            break

    # Rule A: Decision verbs
    for verb in DECISION_VERBS:
        if verb in words or any(verb in doc.lower() for doc in representative_docs):
            detected_verbs.append(verb)
            friction_score += 0.12

    # Rule B: Tool + effort
    for tool, efforts in TOOL_EFFORT_PATTERNS:
        if tool in words:
            for effort in efforts:
                if effort in words:
                    detected_tools.append(f"{tool}+{effort}")
                    friction_score += 0.15
                    break

    # Rule C: Volume + ambiguity
    volume_count = sum(1 for v in VOLUME_PATTERNS if v in all_text)
    ambiguity_count = sum(1 for a in AMBIGUITY_PATTERNS if a in all_text)

    if volume_count > 0:
        detected_volume.append(f"volume:{volume_count}")
        friction_score += volume_count * 0.08

    if ambiguity_count > 0:
        detected_volume.append(f"ambiguidade:{ambiguity_count}")
        friction_score += ambiguity_count * 0.06

    # Determine primary friction type (priority order)
    friction_type = 'tema_generico'
    impact = None

    if inferred_friction:
        friction_type = 'profession_inferred'
        impact = f"Fricção inferida: {inferred_friction}"
    elif detected_verbs and detected_tools:
        friction_type = 'manual_workaround'
        impact = FRICTION_IMPACTS['manual_workaround']
    elif len(detected_verbs) >= 2:
        friction_type = 'decision_overload'
        impact = FRICTION_IMPACTS['decision_overload']
    elif detected_tools:
        friction_type = 'manual_workaround'
        impact = FRICTION_IMPACTS['manual_workaround']
    elif volume_count >= 2 or (volume_count > 0 and ambiguity_count > 0):
        friction_type = 'volume_chaos'
        impact = FRICTION_IMPACTS['volume_chaos']
    elif detected_verbs:
        friction_type = 'potential_friction'
        impact = 'Fricção potencial - requer análise mais profunda'

    return {
        'friction_type': friction_type,
        'friction_score': min(1.0, friction_score),
        'is_friction': friction_score >= 0.25,
        'detected_verbs': detected_verbs[:5],
        'detected_tools': detected_tools[:5] + inferred_workarounds[:3],
        'volume_signals': detected_volume,
        'inferred_friction': inferred_friction,
        'impact': impact
    }


def extract_routine_from_topic(keywords: List[str], docs: List[str]) -> str:
    """
    Extract the operational routine described by a topic.
    """
    # Find the most descriptive verb-noun combination
    all_text = ' '.join(docs).lower()

    # Common routine patterns in Portuguese
    routine_patterns = [
        r'(atender|responder|qualificar|agendar|confirmar|enviar|receber)\s+\w+',
        r'\w+\s+(de|do|da|dos|das)\s+(cliente|lead|paciente|aluno|contato)',
        r'(gestão|controle|organização)\s+de\s+\w+',
    ]

    for pattern in routine_patterns:
        matches = re.findall(pattern, all_text)
        if matches:
            if isinstance(matches[0], tuple):
                return ' '.join(matches[0])
            return matches[0]

    # Fallback: use top keywords
    return ' + '.join(keywords[:3])


# ==================== SUPABASE & DATA ====================

def get_supabase_client() -> Client:
    """Initialize Supabase client."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        raise ValueError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_leads_by_market(supabase: Client) -> Dict[str, List[Dict]]:
    """
    Fetch leads grouped by business_category (market).
    Returns dict: {market_name: [leads]}
    """
    print("\n📥 Buscando leads com embeddings do Supabase...")

    # First, get the market distribution
    markets_query = supabase.table("instagram_leads").select(
        "business_category"
    ).not_.is_("embedding", "null").not_.is_("bio", "null").not_.is_("business_category", "null")

    # Paginate to count all
    all_categories = []
    offset = 0
    page_size = 1000

    while True:
        response = markets_query.range(offset, offset + page_size - 1).execute()
        if not response.data:
            break
        all_categories.extend([r['business_category'] for r in response.data])
        if len(response.data) < page_size:
            break
        offset += page_size
        if offset > 50000:  # Safety limit
            break

    # Count by market
    market_counts = Counter(all_categories)
    print(f"   ✓ {len(market_counts)} mercados encontrados")

    # Filter markets with enough leads
    valid_markets = {m: c for m, c in market_counts.items()
                     if c >= MIN_MARKET_SIZE and m and m.strip()}

    print(f"   ✓ {len(valid_markets)} mercados com >= {MIN_MARKET_SIZE} leads")

    # Show top markets
    top_markets = sorted(valid_markets.items(), key=lambda x: x[1], reverse=True)[:10]
    print("\n   Top 10 mercados:")
    for market, count in top_markets:
        print(f"      • {market}: {count:,} leads")

    # Fetch leads for each valid market
    markets_data = {}

    for market, count in sorted(valid_markets.items(), key=lambda x: x[1], reverse=True)[:15]:
        print(f"\n   📦 Carregando: {market} ({count} leads)...")

        leads = []
        offset = 0
        limit = min(count, MAX_LEADS_PER_MARKET)

        while len(leads) < limit:
            try:
                query = supabase.table("instagram_leads").select(
                    "id, username, bio, business_category, profession, embedding"
                ).eq("business_category", market).not_.is_("embedding", "null").not_.is_("bio", "null").range(offset, offset + page_size - 1)

                response = query.execute()
                if not response.data:
                    break

                leads.extend(response.data)

                if len(response.data) < page_size:
                    break

                offset += page_size

            except Exception as e:
                print(f"      ⚠ Erro na página {offset}: {e}")
                break

        if leads:
            markets_data[market] = leads[:limit]
            print(f"      ✓ {len(markets_data[market])} leads carregados")

    return markets_data


def prepare_market_data(leads: List[Dict]) -> Tuple[np.ndarray, List[str], List[Dict]]:
    """
    Prepare embeddings, bios, and metadata for a market.
    """
    embeddings = []
    bios = []
    metadata = []

    for lead in leads:
        if lead.get("embedding") and lead.get("bio"):
            emb = lead["embedding"]
            if isinstance(emb, str):
                emb = json.loads(emb)

            # Enrich bio text with profession if available
            bio_text = lead["bio"] or ""
            if lead.get("profession"):
                bio_text = f"{lead['profession']}. {bio_text}"

            embeddings.append(emb)
            bios.append(bio_text)
            metadata.append({
                "id": lead["id"],
                "username": lead.get("username"),
                "profession": lead.get("profession")
            })

    return np.array(embeddings), bios, metadata


# ==================== BERTOPIC MODEL ====================

def get_portuguese_stopwords() -> List[str]:
    """Get Portuguese stopwords list."""
    return [
        # Common Portuguese stopwords
        'a', 'ao', 'aos', 'aquela', 'aquelas', 'aquele', 'aqueles', 'aquilo',
        'as', 'até', 'com', 'como', 'da', 'das', 'de', 'dela', 'delas', 'dele',
        'deles', 'depois', 'do', 'dos', 'e', 'ela', 'elas', 'ele', 'eles', 'em',
        'entre', 'era', 'eram', 'essa', 'essas', 'esse', 'esses', 'esta', 'estas',
        'este', 'estes', 'eu', 'foi', 'for', 'foram', 'fosse', 'fossem', 'há',
        'isso', 'isto', 'já', 'lhe', 'lhes', 'lo', 'mas', 'me', 'mesmo', 'meu',
        'meus', 'minha', 'minhas', 'muito', 'na', 'nas', 'nem', 'no', 'nos',
        'nós', 'nossa', 'nossas', 'nosso', 'nossos', 'num', 'numa', 'o', 'os',
        'ou', 'para', 'pela', 'pelas', 'pelo', 'pelos', 'por', 'qual', 'quando',
        'que', 'quem', 'se', 'seja', 'sejam', 'sem', 'seu', 'seus', 'só', 'sua',
        'suas', 'também', 'te', 'tem', 'tendo', 'tens', 'ter', 'teu', 'teus',
        'ti', 'tive', 'tivemos', 'tiver', 'tivera', 'tiveram', 'tiverem',
        'tivesse', 'tivessem', 'tu', 'tua', 'tuas', 'um', 'uma', 'umas', 'uns',
        'você', 'vocês', 'vos',
        # Instagram specific (remove noise, not signal)
        'link', 'bio', 'instagram', 'insta', 'dm', 'direct', 'segue', 'siga',
        'clique', 'acesse', 'www', 'http', 'https', 'com', 'br', 'contato',
    ]


def create_bertopic_model(n_docs: int) -> BERTopic:
    """
    Create BERTopic model optimized for friction discovery.
    """
    # Adjust parameters based on dataset size
    adjusted_min_cluster = max(15, min(MIN_CLUSTER_SIZE, n_docs // 20))
    adjusted_min_samples = max(5, min(MIN_SAMPLES, adjusted_min_cluster // 2))

    # UMAP for dimensionality reduction
    umap_model = UMAP(
        n_neighbors=min(N_NEIGHBORS, n_docs // 10),
        n_components=N_COMPONENTS,
        min_dist=0.0,
        metric='cosine',
        random_state=42,
        low_memory=True,
        verbose=False
    )

    # HDBSCAN for density-based clustering
    hdbscan_model = HDBSCAN(
        min_cluster_size=adjusted_min_cluster,
        min_samples=adjusted_min_samples,
        metric='euclidean',
        cluster_selection_method='eom',
        prediction_data=True
    )

    # Vectorizer - very lenient parameters for topic extraction
    vectorizer_model = CountVectorizer(
        stop_words=get_portuguese_stopwords(),
        min_df=2,      # At least 2 documents
        max_df=0.95,   # Up to 95% of documents
        ngram_range=(1, 2)
    )

    # Skip OpenAI representation for now (compatibility issues with BERTopic 0.17)
    representation_model = None

    # Create BERTopic model
    topic_model = BERTopic(
        umap_model=umap_model,
        hdbscan_model=hdbscan_model,
        vectorizer_model=vectorizer_model,
        representation_model=representation_model,
        top_n_words=12,
        verbose=False,
        calculate_probabilities=False,
        language="portuguese"
    )

    return topic_model


# ==================== ANALYSIS ====================

def analyze_market(market_name: str, leads: List[Dict]) -> Dict[str, Any]:
    """
    Run BERTopic++ analysis on a single market.
    Returns friction units and market analysis.
    """
    print(f"\n🔍 Analisando mercado: {market_name}")

    # Prepare data
    embeddings, bios, metadata = prepare_market_data(leads)
    n_docs = len(bios)

    if n_docs < MIN_MARKET_SIZE:
        return {'error': f'Insufficient data: {n_docs} < {MIN_MARKET_SIZE}'}

    print(f"   📊 {n_docs} leads com embeddings válidos")

    # Create and fit model
    topic_model = create_bertopic_model(n_docs)

    try:
        topics, _ = topic_model.fit_transform(bios, embeddings)
    except Exception as e:
        print(f"   ❌ Erro no BERTopic: {e}")
        return {'error': str(e)}

    # Get topic info
    topic_info = topic_model.get_topic_info()
    valid_topics = topic_info[topic_info['Topic'] != -1]

    outliers = sum(1 for t in topics if t == -1)
    coverage = (n_docs - outliers) / n_docs * 100

    print(f"   ✓ {len(valid_topics)} tópicos descobertos")
    print(f"   ✓ {coverage:.1f}% cobertura (excl. outliers)")

    # Analyze each topic for friction
    friction_units = []

    for _, row in valid_topics.iterrows():
        topic_id = row['Topic']
        count = row['Count']

        # Get topic details
        topic_words = topic_model.get_topic(topic_id)
        keywords = [word for word, score in topic_words[:12]] if topic_words else []

        representative_docs = topic_model.get_representative_docs(topic_id) or []

        # Apply friction detection rules
        friction_analysis = detect_friction_type(keywords, representative_docs[:10])

        # Extract routine
        routine = extract_routine_from_topic(keywords, representative_docs[:5])

        # Get topic label
        topic_label = row.get('Name', f'Topic_{topic_id}')

        friction_unit = {
            'topic_id': int(topic_id),
            'market': market_name,
            'label': topic_label,
            'count': int(count),
            'percentage': round(count / n_docs * 100, 2),
            'keywords': keywords,
            'routine': routine,
            'representative_bios': representative_docs[:3],
            **friction_analysis
        }

        friction_units.append(friction_unit)

    # Sort by friction score
    friction_units.sort(key=lambda x: x['friction_score'], reverse=True)

    # Calculate market friction metrics
    total_friction_score = sum(f['friction_score'] for f in friction_units if f['is_friction'])
    friction_count = sum(1 for f in friction_units if f['is_friction'])

    return {
        'market': market_name,
        'total_leads': n_docs,
        'topics_discovered': len(valid_topics),
        'coverage_percentage': round(coverage, 2),
        'friction_units': friction_units,
        'metrics': {
            'friction_count': friction_count,
            'total_friction_score': round(total_friction_score, 3),
            'avg_friction_score': round(total_friction_score / max(1, friction_count), 3),
            'friction_density': round(friction_count / max(1, len(valid_topics)), 3)
        }
    }


def rank_markets(market_results: List[Dict]) -> List[Dict]:
    """
    Rank markets by product potential based on friction analysis.

    Best market for product =
        - High friction density (many topics are frictions)
        - Dominant friction (one friction stands out)
        - Clear workarounds (tools being used)
    """
    rankings = []

    for result in market_results:
        if 'error' in result:
            continue

        metrics = result['metrics']
        friction_units = result['friction_units']

        # Calculate product potential score
        friction_density = metrics['friction_density']
        avg_friction = metrics['avg_friction_score']

        # Check for dominant friction
        if friction_units:
            top_friction = friction_units[0]
            dominance = top_friction['friction_score'] / max(0.01, sum(f['friction_score'] for f in friction_units[:3]) / 3)
        else:
            dominance = 0

        # Check for clear workarounds
        workaround_count = sum(1 for f in friction_units if f['detected_tools'])

        # Product potential score (0-100)
        product_score = (
            friction_density * 30 +
            avg_friction * 25 +
            min(1, dominance) * 25 +
            min(1, workaround_count / 3) * 20
        )

        rankings.append({
            'market': result['market'],
            'product_potential_score': round(product_score, 1),
            'total_leads': result['total_leads'],
            'friction_count': metrics['friction_count'],
            'top_friction': friction_units[0] if friction_units else None,
            'has_dominant_friction': dominance > 1.5,
            'workaround_tools': list(set(
                tool for f in friction_units for tool in f['detected_tools']
            ))[:5]
        })

    rankings.sort(key=lambda x: x['product_potential_score'], reverse=True)
    return rankings


# ==================== OUTPUT ====================

def save_results(all_results: Dict, output_dir: str = "scripts/output"):
    """Save results to JSON file."""
    os.makedirs(output_dir, exist_ok=True)

    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    filename = f"{output_dir}/market_demands_{timestamp}.json"

    with open(filename, 'w', encoding='utf-8') as f:
        json.dump(all_results, f, ensure_ascii=False, indent=2)

    print(f"\n💾 Resultados salvos em: {filename}")
    return filename


def print_results(all_results: Dict):
    """Print formatted results to console."""
    print("\n" + "="*70)
    print("🏆 RANKING DE MERCADOS POR POTENCIAL DE PRODUTO")
    print("="*70)

    rankings = all_results.get('market_rankings', [])

    for i, market in enumerate(rankings[:10], 1):
        print(f"\n#{i} {market['market']}")
        print(f"   📊 Score: {market['product_potential_score']}/100")
        print(f"   👥 {market['total_leads']:,} leads | {market['friction_count']} fricções")

        if market['top_friction']:
            tf = market['top_friction']
            print(f"   🎯 Top fricção: {tf['routine']}")
            print(f"      Keywords: {', '.join(tf['keywords'][:5])}")
            print(f"      Tipo: {tf['friction_type']} (score: {tf['friction_score']:.2f})")

        if market['workaround_tools']:
            print(f"   🔧 Workarounds: {', '.join(market['workaround_tools'])}")

        if market['has_dominant_friction']:
            print(f"   ⭐ Tem fricção dominante - EXCELENTE para produto!")

    print("\n" + "="*70)
    print("💡 RECOMENDAÇÃO")
    print("="*70)

    if rankings:
        best = rankings[0]
        print(f"\n🎯 Mercado recomendado: {best['market']}")
        print(f"   Score de potencial: {best['product_potential_score']}/100")

        if best['top_friction']:
            print(f"\n   Produto sugerido:")
            print(f"   → Resolver: {best['top_friction']['routine']}")
            if best['top_friction']['impact']:
                print(f"   → Impacto: {best['top_friction']['impact']}")

    print("\n" + "="*70)


# ==================== MAIN ====================

def main():
    """Main execution flow."""
    try:
        # 1. Initialize Supabase
        supabase = get_supabase_client()

        # 2. Fetch leads grouped by market
        markets_data = fetch_leads_by_market(supabase)

        if not markets_data:
            print("❌ Nenhum mercado com dados suficientes encontrado")
            return None

        # 3. Analyze each market
        print("\n" + "="*70)
        print("🔬 INICIANDO ANÁLISE BERTOPIC++ POR MERCADO")
        print("="*70)

        market_results = []

        for market_name, leads in markets_data.items():
            result = analyze_market(market_name, leads)
            market_results.append(result)

        # 4. Rank markets by product potential
        market_rankings = rank_markets(market_results)

        # 5. Compile final results
        all_results = {
            'generated_at': datetime.now().isoformat(),
            'methodology': 'BERTopic++ (BERTopic + Friction Rules)',
            'total_markets_analyzed': len(market_results),
            'market_rankings': market_rankings,
            'detailed_results': market_results,
            'friction_rules_applied': {
                'decision_verbs': len(DECISION_VERBS),
                'tool_effort_patterns': len(TOOL_EFFORT_PATTERNS),
                'volume_patterns': len(VOLUME_PATTERNS),
                'ambiguity_patterns': len(AMBIGUITY_PATTERNS)
            }
        }

        # 6. Save and display
        output_file = save_results(all_results)
        print_results(all_results)

        print(f"\n✅ Análise BERTopic++ concluída!")
        print(f"📄 Resultados detalhados em: {output_file}")

        return all_results

    except Exception as e:
        print(f"\n❌ Erro: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    main()

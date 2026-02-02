#!/usr/bin/env python3
"""
D2P Analysis Engine - Decision-to-Product Framework

REGRA FUNDAMENTAL:
- Workaround NÃO é a dor
- A dor real é sempre: UMA DECISÃO que o humano é forçado a tomar repetidamente
- Produto = "Sistema que decide [X] automaticamente"

Pipeline (Node.js does steps 1-2, Python does steps 3-5):
1. MERCADO → Node.js gera market embedding via OpenAI
2. BUSCA → Node.js chama pgvector RPC search_leads_for_d2p
3. WORKAROUNDS → Padrões detectados nas bios (Python)
4. DECISÕES → Tradução workaround → decisão humana (Python)
5. SCORE D2P → 5 critérios binários (Python)
6. PRODUTO → Definição estruturada com MVP (Python)

Input (stdin JSON):
{
    "market_name": "Advogados",
    "version_id": "advogados_v1_20260128",
    "leads": [
        {"lead_id": "uuid", "username": "x", "bio": "...", "profession": "Advogado",
         "business_category": "juridico", "similarity": 0.82},
        ...
    ]
}

Output:
{
    "success": true,
    "product": {
        "name": "LegalGate",
        "type": "gatekeeper",
        "decision": "Aceito esse caso?",
        "tagline": "Pare de decidir manualmente quais casos aceitar",
        ...
    }
}
"""

import sys
import json
import re
import os
from datetime import datetime
from typing import List, Dict, Any, Tuple, Optional

try:
    from bertopic import BERTopic
    from umap import UMAP
    from hdbscan import HDBSCAN
    from sklearn.feature_extraction.text import CountVectorizer
    from sentence_transformers import SentenceTransformer
except ImportError as e:
    print(json.dumps({"success": False, "error": f"Missing dependency: {e}"}))
    sys.exit(1)

try:
    from openai import OpenAI
    _openai_available = True
except ImportError:
    _openai_available = False

# ==============================================================================
# CONFIGURATION
# ==============================================================================

MIN_CLUSTER_SIZE = 50
MIN_SAMPLES = 20
N_NEIGHBORS = 15
N_COMPONENTS = 10

EMBEDDING_MODEL = "paraphrase-multilingual-MiniLM-L12-v2"
_sentence_model = None

def get_sentence_model() -> SentenceTransformer:
    global _sentence_model
    if _sentence_model is None:
        print(f"[D2P] Loading model: {EMBEDDING_MODEL}", file=sys.stderr)
        _sentence_model = SentenceTransformer(EMBEDDING_MODEL)
    return _sentence_model


# ==============================================================================
# D2P FRAMEWORK - WORKAROUND → DECISÃO
# ==============================================================================

# Mapeamento: Workaround observável → Decisão humana repetitiva
WORKAROUND_TO_DECISION = {
    # Ferramentas de comunicação
    'whatsapp': {
        'workaround': 'WhatsApp como canal principal',
        'decision': 'Respondo ou ignoro essa mensagem?',
        'friction': 'Triagem de mensagens sem critério',
        'product_type': 'triage',
        'resource': 'atenção'
    },
    'dm': {
        'workaround': 'DM/Direct como funil',
        'decision': 'Esse lead vale meu tempo?',
        'friction': 'Qualificação manual de leads',
        'product_type': 'triage',
        'resource': 'tempo'
    },
    'instagram': {
        'workaround': 'Instagram para captação',
        'decision': 'Respondo esse comentário/DM?',
        'friction': 'Priorização de interações',
        'product_type': 'triage',
        'resource': 'atenção'
    },
    'email': {
        'workaround': 'Email para follow-up',
        'decision': 'Esse lead precisa de follow-up agora?',
        'friction': 'Timing de follow-up manual',
        'product_type': 'operational_decision',
        'resource': 'tempo'
    },
    'telefone': {
        'workaround': 'Ligações manuais',
        'decision': 'Ligo agora ou depois?',
        'friction': 'Priorização de retornos',
        'product_type': 'operational_decision',
        'resource': 'tempo'
    },

    # Ferramentas de organização
    'agenda': {
        'workaround': 'Agenda manual',
        'decision': 'Tenho horário para esse cliente?',
        'friction': 'Gestão de disponibilidade',
        'product_type': 'gatekeeper',
        'resource': 'agenda'
    },
    'planilha': {
        'workaround': 'Planilha para controle',
        'decision': 'Onde registro essa informação?',
        'friction': 'Fragmentação de dados',
        'product_type': 'operational_decision',
        'resource': 'dados'
    },
    'excel': {
        'workaround': 'Excel para gestão',
        'decision': 'Como organizo esses dados?',
        'friction': 'Gestão manual de informações',
        'product_type': 'operational_decision',
        'resource': 'dados'
    },
    'crm': {
        'workaround': 'CRM manual',
        'decision': 'Atualizo o cadastro agora?',
        'friction': 'Manutenção de dados de clientes',
        'product_type': 'operational_decision',
        'resource': 'dados'
    },

    # Processos de qualificação
    'formulario': {
        'workaround': 'Formulário de aplicação',
        'decision': 'Esse candidato é qualificado?',
        'friction': 'Triagem de aplicações',
        'product_type': 'triage',
        'resource': 'tempo'
    },
    'diagnostico': {
        'workaround': 'Diagnóstico/sessão grátis',
        'decision': 'Vale investir tempo nesse lead?',
        'friction': 'Qualificação via tempo gasto',
        'product_type': 'triage',
        'resource': 'tempo'
    },

    # Processos operacionais
    'pedido': {
        'workaround': 'Pedido via mensagem',
        'decision': 'Aceito esse pedido?',
        'friction': 'Avaliação manual de pedidos',
        'product_type': 'gatekeeper',
        'resource': 'capacidade'
    },
    'encomenda': {
        'workaround': 'Encomendas manuais',
        'decision': 'Consigo entregar no prazo?',
        'friction': 'Gestão de capacidade',
        'product_type': 'gatekeeper',
        'resource': 'capacidade'
    },
    'orcamento': {
        'workaround': 'Orçamento manual',
        'decision': 'Quanto cobro por isso?',
        'friction': 'Precificação caso a caso',
        'product_type': 'operational_decision',
        'resource': 'pricing'
    },
    'reserva': {
        'workaround': 'Reserva manual',
        'decision': 'Confirmo essa reserva?',
        'friction': 'Gestão de disponibilidade',
        'product_type': 'gatekeeper',
        'resource': 'estoque'
    },
    'delivery': {
        'workaround': 'Delivery próprio',
        'decision': 'Consigo entregar nesse endereço?',
        'friction': 'Avaliação de viabilidade',
        'product_type': 'operational_decision',
        'resource': 'logística'
    }
}

# Sinais de frequência/volume nas bios
FREQUENCY_SIGNALS = [
    'diário', 'diariamente', 'todo dia', 'todos os dias', 'sempre',
    'constante', 'frequente', 'rotina', 'segunda a sexta', 'seg-sex'
]

VOLUME_SIGNALS = [
    'muitos', 'vários', 'diversos', 'centenas', 'dezenas', 'milhares',
    '+100', '+500', '+1000', 'alta demanda', 'lotado'
]

MANUAL_SIGNALS = [
    'manual', 'manualmente', 'eu mesmo', 'personalizado', 'artesanal',
    'sob medida', 'feito à mão', 'one by one', 'um a um'
]

# ==============================================================================
# BUSINESS OWNER PAIN — Sinais de dor do DONO (não do cliente final)
# ==============================================================================

# Terms that signal BUSINESS pain (margin, churn, ops) — not service delivery pain
BUSINESS_OWNER_SIGNALS = [
    # Margem e precificação
    'margem', 'lucro', 'lucrativo', 'rentável', 'rentabilidade',
    'precificação', 'preço', 'valor', 'fee', 'ticket',
    'custo', 'investimento', 'roi', 'retorno',
    # Escopo e retrabalho
    'escopo', 'retrabalho', 'refação', 'refazer', 'ajuste',
    'briefing', 'escopo aberto', 'scope creep',
    # Contratos e clientes
    'contrato', 'proposta', 'sla', 'prazo', 'deadline',
    'churn', 'cancelamento', 'cancelar', 'reter', 'retenção',
    # Time e capacidade
    'time', 'equipe', 'colaborador', 'freelancer', 'terceirizar',
    'capacidade', 'escalar', 'escala', 'crescer', 'crescimento',
    'delegar', 'contratar', 'demanda interna',
    # Gestão operacional
    'processo', 'workflow', 'fluxo', 'operação', 'gestão',
    'indicador', 'kpi', 'meta', 'resultado', 'performance',
    'eficiência', 'produtividade',
]


def infer_business_owner_decisions(
    market_name: str,
    bio_business_signals: Dict[str, int],
    n_leads: int,
    topic_keywords: List[List[str]] = None,
    representative_bios: List[List[str]] = None,
) -> Dict[str, Any]:
    """
    Infer the BUSINESS OWNER's decisions using GPT-4o-mini.
    Returns empty if LLM unavailable — no heuristic fallback.
    """
    market_lower = market_name.lower()
    intermediary_signals = ['agência', 'agencia', 'consultoria', 'assessoria',
                           'marketing digital', 'social media', 'gestão de']
    is_intermediary = any(sig in market_lower for sig in intermediary_signals)

    # Collect business signal summary for context
    signal_summary = _summarize_business_signals(bio_business_signals, n_leads)

    # Try LLM
    llm_result = _infer_via_llm(market_name, signal_summary, is_intermediary, topic_keywords, representative_bios)

    if llm_result:
        return {
            'owner_decisions': llm_result['decisions'],
            'evidence': llm_result['evidence'],
            'is_intermediary': is_intermediary,
            'business_signal_counts': _count_signal_groups(bio_business_signals),
            'source': 'llm',
        }

    # No fallback — better to return empty than to invent wrong decisions
    print(f"[D2P] LLM inference failed, no owner decisions available", file=sys.stderr)
    return {
        'owner_decisions': [],
        'evidence': ['LLM indisponível — owner decisions não geradas'],
        'is_intermediary': is_intermediary,
        'business_signal_counts': _count_signal_groups(bio_business_signals),
        'source': 'none',
    }


def _summarize_business_signals(signals: Dict[str, int], n_leads: int) -> str:
    """Create a human-readable summary of business signals found in bios."""
    if not signals:
        return "Nenhum sinal de dor operacional encontrado diretamente nas bios."

    parts = []
    sorted_signals = sorted(signals.items(), key=lambda x: -x[1])[:10]
    for term, count in sorted_signals:
        pct = count / n_leads * 100
        parts.append(f'"{term}" em {count} bios ({pct:.0f}%)')
    return "Termos de negócio encontrados nas bios: " + ", ".join(parts)


def _count_signal_groups(bio_business_signals: Dict[str, int]) -> Dict[str, int]:
    margin_terms = ['margem', 'lucro', 'lucrativo', 'rentável', 'rentabilidade',
                    'precificação', 'preço', 'fee', 'ticket', 'custo', 'roi']
    scope_terms = ['escopo', 'retrabalho', 'refação', 'refazer', 'ajuste',
                   'briefing', 'scope creep']
    team_terms = ['time', 'equipe', 'colaborador', 'freelancer', 'terceirizar',
                  'capacidade', 'escalar', 'delegar', 'contratar']
    churn_terms = ['churn', 'cancelamento', 'cancelar', 'reter', 'retenção',
                   'contrato', 'proposta', 'sla']

    return {
        'margin': sum(bio_business_signals.get(s, 0) for s in margin_terms),
        'scope': sum(bio_business_signals.get(s, 0) for s in scope_terms),
        'team': sum(bio_business_signals.get(s, 0) for s in team_terms),
        'churn': sum(bio_business_signals.get(s, 0) for s in churn_terms),
    }


def _infer_via_llm(
    market_name: str,
    signal_summary: str,
    is_intermediary: bool,
    topic_keywords: List[List[str]] = None,
    representative_bios: List[List[str]] = None,
) -> Optional[Dict[str, Any]]:
    """Call GPT-4o-mini to infer business owner decisions."""
    api_key = os.environ.get('OPENAI_API_KEY')
    if not api_key or not _openai_available:
        print(f"[D2P] OpenAI not available (key={'set' if api_key else 'missing'}, "
              f"lib={'ok' if _openai_available else 'missing'})", file=sys.stderr)
        return None

    if is_intermediary:
        intermediary_ctx = (
            "ATENÇÃO: Este é um negócio INTERMEDIÁRIO (agência/consultoria). "
            "A dor é do DONO do negócio, não dos clientes que ele atende."
        )
    else:
        intermediary_ctx = ""

    # Collect BERTopic topic keywords for grounding
    topic_keywords_str = ""
    if topic_keywords:
        topics_formatted = []
        for i, kws in enumerate(topic_keywords):
            if not kws:
                continue
            topic_line = f"Tópico {i}: palavras-chave=[{', '.join(kws[:6])}]"
            # Attach representative bios if available
            if representative_bios and i < len(representative_bios) and representative_bios[i]:
                bios_sample = representative_bios[i][:2]  # max 2 bios per topic
                bios_text = " | ".join(b[:150] for b in bios_sample)
                topic_line += f" — exemplos de bios: \"{bios_text}\""
            topics_formatted.append(topic_line)
        topic_keywords_str = "- Tópicos BERTopic descobertos nos dados:\n  " + "\n  ".join(topics_formatted)

    prompt = f"""Analise os DADOS ABAIXO e identifique as decisões operacionais repetitivas do DONO deste negócio.

REGRA FUNDAMENTAL:
O dado só pode afirmar o que ele LITERALMENTE contém.
Qualquer explicação causal é hipótese, não fricção.
Se os dados são insuficientes, retorne {{"decisions": []}}.

ESPECIFICIDADE DE MERCADO — REGRA OBRIGATÓRIA:
- As decisões devem ser ESPECÍFICAS para {market_name}.
- Se a decisão serve para qualquer mercado, está ERRADA. DESCARTE.
- TESTE DE SUBSTITUIÇÃO: substitua "{market_name}" por "Padaria", "Advogado", "Personal Trainer". Se a decisão continua fazendo sentido para esses mercados, ela é genérica demais — DESCARTE.
- Use os tópicos BERTopic como evidência obrigatória — cada decisão DEVE citar qual tópico a fundamenta.

EXEMPLOS DE DECISÕES GENÉRICAS PROIBIDAS (servem para QUALQUER mercado):
- "Esse contato merece minha atenção agora?" — qualquer dono de negócio se pergunta isso
- "Respondo agora ou depois?" — qualquer pessoa com inbox cheia se pergunta isso
- "Esse cliente vale meu tempo?" — genérico demais
- "Priorizo esse atendimento?" — genérico demais

EXEMPLOS DE DECISÕES ESPECÍFICAS BOAS:
- Para Agência de Marketing: "Aceito esse job com prazo apertado ou recuso?" (específico: agências lidam com jobs e prazos)
- Para Agência de Marketing: "Pego esse cliente mesmo sem budget definido?" (específico: agências negociam budget)
- Para Advogado: "Assumo essa causa mesmo com chance baixa?" (específico: advogados avaliam viabilidade jurídica)
- Para Personal Trainer: "Aceito esse aluno com restrição médica?" (específico: trainers lidam com saúde)

DECISÃO — REGRAS:
- Binária: sim/não, agora/depois, aceito/recuso, passa/não passa.
- Linguagem do DONO no dia a dia. Ele fala de "cliente", "mensagem", "pedido", "proposta", "job".
- NÃO usar termos técnicos de sistema: "bio", "lead", "funil", "scraping", "embedding", "tópico".
- A decisão deve ser CEGA: descreve O QUE o dono decide, sem eleger QUAL critério usar.
- A primeira decisão do array deve ser a PRINCIPAL (maior peso).

DECISÃO — EXEMPLO CORRETO vs ERRADO:
- ERRADO: "Essa bio passa ou não passa pelo filtro?" (linguagem de sistema, dono não fala "bio")
- ERRADO: "Esse contato merece minha atenção agora?" (genérico — serve para qualquer mercado)
- ERRADO: "Respondo agora ou depois?" (genérico — qualquer pessoa com inbox se pergunta isso)
- ERRADO: "Aceito clientes que mencionam 'resultado'?" (elege um sinal específico)
- ERRADO: "Priorizo leads com urgência?" (linguagem de sistema + elege critério)
- CORRETO: "Aceito esse job com prazo apertado ou recuso?" (específico para agência: linguagem do dono, decisão real)
- CORRETO: "Pego esse cliente mesmo sem budget definido?" (específico para agência: reflete dor real do mercado)

FRICÇÃO — O QUE É PERMITIDO:
- Comportamento observável: "Alta carga cognitiva para decidir quais mensagens merecem atenção"
- Frequência: "Decisão que se repete muitas vezes por dia"
- Incerteza: "Sem critério claro, depende de julgamento manual cada vez"
- Volume: "Grande quantidade de entradas para filtrar manualmente"

FRICÇÃO — O QUE É PROIBIDO:
- NÃO eleger termos específicos como critério ("resultado", "urgência", "tipo de cliente")
- NÃO mencionar margem, conversão, ROI, faturamento, oportunidade perdida
- NÃO racionalizar por que uma opção é melhor que outra
- NÃO citar percentuais ou números que não estejam nos dados
- NÃO usar linguagem de consultor ("otimizar", "maximizar", "alavancar")
- NÃO usar linguagem técnica de sistema ("bio", "lead", "funil", "scraping", "embedding")

TESTE DE SANIDADE: Se amanhã o modelo descobrir que outro padrão é mais relevante, a decisão e a fricção continuam válidas? Se não, está enviesada.

DADOS:
- Mercado analisado: {market_name}
- {intermediary_ctx}
- {signal_summary}
{topic_keywords_str}

Responda EXCLUSIVAMENTE em JSON válido (sem markdown, sem ```):
{{
  "decisions": [
    {{
      "decision": "Pergunta binária CEGA que o dono se faz todo dia — ESPECÍFICA para {market_name} (NÃO pode servir para outro mercado)",
      "friction": "Comportamento observável, sem eleger critério ou sinal — ESPECÍFICO para {market_name}",
      "product_type": "gatekeeper|triage|operational_decision",
      "weight": 0.0 a 1.0,
      "grounded_in": "Tópico N + evidência dos dados. Explique por que esta decisão NÃO se aplica a uma padaria ou advogado."
    }}
  ]
}}"""

    try:
        client = OpenAI(api_key=api_key)
        print(f"[D2P] Calling GPT-4o-mini for owner pain inference...", file=sys.stderr)

        response = client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": "Você responde exclusivamente em JSON válido. Sem markdown. Você descreve COMPORTAMENTO OBSERVÁVEL. NUNCA elege um sinal específico como critério. NUNCA racionaliza estratégia. Proibido: margem, ROI, conversão, oportunidade perdida, percentuais inventados, termos específicos como critério de decisão. REGRA CRÍTICA: Decisões genéricas que servem para qualquer mercado são PROIBIDAS. 'Respondo agora ou depois?' e 'Esse contato merece minha atenção?' são exemplos de decisões PROIBIDAS por serem genéricas."},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=1000,
        )

        raw = response.choices[0].message.content.strip()
        # Clean potential markdown wrapping
        if raw.startswith('```'):
            raw = re.sub(r'^```\w*\n?', '', raw)
            raw = re.sub(r'\n?```$', '', raw)

        result = json.loads(raw)

        decisions = result.get('decisions', [])
        evidence = result.get('evidence', [])

        if not decisions:
            print(f"[D2P] LLM returned empty decisions", file=sys.stderr)
            return None

        # Filter out generic decisions that apply to any market
        GENERIC_PATTERNS = [
            "merece minha atenção",
            "respondo agora ou depois",
            "vale meu tempo",
            "priorizo esse atendimento",
            "devo atender agora",
            "dou atenção a esse",
            "merece atenção agora",
            "esse contato merece",
            "esse cliente merece",
        ]
        original_count = len(decisions)
        decisions = [
            d for d in decisions
            if not any(pattern in d.get('decision', '').lower() for pattern in GENERIC_PATTERNS)
        ]
        filtered_count = original_count - len(decisions)
        if filtered_count > 0:
            print(f"[D2P] Filtered {filtered_count} generic decisions (applied to any market)", file=sys.stderr)

        # Validate and normalize
        valid_types = {'gatekeeper', 'triage', 'operational_decision'}
        for d in decisions:
            if d.get('product_type') not in valid_types:
                d['product_type'] = 'operational_decision'
            d['weight'] = max(0.0, min(1.0, float(d.get('weight', 0.5))))

        # Extract grounding evidence from each decision
        evidence = []
        for d in decisions:
            grounded = d.pop('grounded_in', None)
            if grounded:
                evidence.append(f"{d['decision'][:40]}... → {grounded}")

        print(f"[D2P] LLM returned {len(decisions)} owner decisions (grounded)", file=sys.stderr)
        for d in decisions[:3]:
            print(f"[D2P]   → {d['decision']}", file=sys.stderr)

        return {'decisions': decisions, 'evidence': evidence}

    except json.JSONDecodeError as e:
        print(f"[D2P] LLM returned invalid JSON: {e}", file=sys.stderr)
        return None
    except Exception as e:
        print(f"[D2P] LLM call failed: {e}", file=sys.stderr)
        return None




def count_business_signals_per_bio(bios: List[str]) -> Dict[str, int]:
    """Count how many bios contain each business owner signal."""
    counts = {}
    for signal in BUSINESS_OWNER_SIGNALS:
        count = sum(1 for bio in bios if signal in bio.lower())
        if count > 0:
            counts[signal] = count
    return counts


# ==============================================================================
# D2P SCORE - 5 CRITÉRIOS BINÁRIOS
# ==============================================================================

def calculate_d2p_binary_score(
    detected_workarounds: List[Dict],
    lead_bios: List[str],
    n_leads: int
) -> Dict[str, Any]:
    """
    Score D2P com 5 critérios binários.
    Uses proportional signals from individual bios instead of concatenated text
    to avoid inflation (603 bios concatenated will match everything).
    No profession templates — only workarounds and bio signals.

    Critérios:
    1. frequency: Acontece todo dia?
    2. volume: Acontece várias vezes por dia?
    3. manual: Depende de humano decidir?
    4. cost: Erro custa tempo ou dinheiro?
    5. rule: Dá pra transformar em regra simples?

    Score >= 4 = produto candidato forte
    """
    # Count signals across individual bios (proportional, not concatenated)
    frequency_count = 0
    volume_count = 0
    manual_count = 0
    for bio in lead_bios:
        bio_lower = bio.lower()
        if any(s in bio_lower for s in FREQUENCY_SIGNALS):
            frequency_count += 1
        if any(s in bio_lower for s in VOLUME_SIGNALS):
            volume_count += 1
        if any(s in bio_lower for s in MANUAL_SIGNALS):
            manual_count += 1

    # Proportional thresholds: signal must appear in >= 5% of bios to count
    min_proportion = 0.05
    freq_proportion = frequency_count / n_leads if n_leads else 0
    vol_proportion = volume_count / n_leads if n_leads else 0
    manual_proportion = manual_count / n_leads if n_leads else 0

    # 1. FREQUENCY
    frequency = freq_proportion >= min_proportion

    # 2. VOLUME
    volume = vol_proportion >= min_proportion
    if any(w['product_type'] == 'triage' for w in detected_workarounds):
        volume = True

    # 3. MANUAL
    manual = manual_proportion >= min_proportion
    if detected_workarounds:
        manual = True

    # 4. COST: Erro custa tempo ou dinheiro?
    cost = any(w['product_type'] == 'gatekeeper' for w in detected_workarounds)

    # 5. RULE: Dá pra transformar em regra simples?
    rule = any(w['product_type'] in ['triage', 'gatekeeper'] for w in detected_workarounds)

    scores = {
        'frequency': frequency,
        'volume': volume,
        'manual': manual,
        'cost': cost,
        'rule': rule
    }
    total = sum(1 for v in scores.values() if v)

    is_product_candidate = total >= 4
    verdict = "EXCELENTE" if total >= 4 else "MODERADO" if total >= 3 else "FRACO"

    return {
        'scores': scores,
        'total': total,
        'max_score': 5,
        'is_product_candidate': is_product_candidate,
        'verdict': verdict,
        'signal_proportions': {
            'frequency': round(freq_proportion, 3),
            'volume': round(vol_proportion, 3),
            'manual': round(manual_proportion, 3),
        },
        'explanation': {
            'frequency': f"Acontece diariamente ({frequency_count}/{n_leads} bios)" if frequency else f"Não é diário ({frequency_count}/{n_leads} bios)",
            'volume': f"Alto volume de ocorrências ({volume_count}/{n_leads} bios)" if volume else f"Volume baixo/moderado ({volume_count}/{n_leads} bios)",
            'manual': "Depende de decisão humana" if manual else "Já automatizado",
            'cost': "Erro tem custo significativo" if cost else "Erro tem baixo impacto",
            'rule': "Pode ser regra simples" if rule else "Requer análise complexa"
        }
    }


# ==============================================================================
# PRODUCT DEFINITION
# ==============================================================================

def determine_product_type(workarounds: List[Dict]) -> Dict[str, Any]:
    """
    Determina tipo de produto baseado apenas em workarounds detectados.
    No profession templates — pipeline is blind.
    - GATEKEEPER: Protege recursos escassos (agenda, estoque, capacidade)
    - TRIAGE: Classifica entradas caóticas (leads, pedidos, mensagens)
    - OPERATIONAL_DECISION: Decide ações operacionais (aceitar, recusar, priorizar)
    """
    type_counts = {'gatekeeper': 0, 'triage': 0, 'operational_decision': 0}

    for w in workarounds:
        ptype = w.get('product_type', 'operational_decision')
        type_counts[ptype] = type_counts.get(ptype, 0) + 1

    # Tipo dominante
    dominant_type = max(type_counts, key=type_counts.get)

    type_descriptions = {
        'gatekeeper': {
            'name': 'Gatekeeper',
            'description': 'Protege recursos escassos (agenda, estoque, capacidade)',
            'value_prop': 'Decide automaticamente quem/o que passa',
            'examples': ['Agenda inteligente', 'Aceitação de pedidos', 'Gestão de capacidade']
        },
        'triage': {
            'name': 'Triage',
            'description': 'Classifica entradas caóticas (leads, pedidos, mensagens)',
            'value_prop': 'Prioriza automaticamente por critérios definidos',
            'examples': ['Qualificação de leads', 'Triagem de mensagens', 'Classificação de urgência']
        },
        'operational_decision': {
            'name': 'Decisão Operacional',
            'description': 'Decide ações operacionais rotineiras',
            'value_prop': 'Responde "posso/não posso" automaticamente',
            'examples': ['Precificação', 'Follow-up timing', 'Personalização']
        }
    }

    return {
        'type': dominant_type,
        'type_counts': type_counts,
        **type_descriptions[dominant_type]
    }


def generate_product_definition(
    market_name: str,
    dominant_decision: str,
    dominant_friction: str,
    product_type: Dict,
    workaround_tools: List[str],
    d2p_score: Dict,
    micro_decisions: List[str] = None,
) -> Dict[str, Any]:
    """
    Gera definição estruturada do produto.

    AJUSTE 3: Produto é um "motor de decisão binária operacional",
    não um "sistema que decide tudo". Responde: faça/não faça, agora/depois.

    AJUSTE 4: MVP NÃO promete substituir CRM/Excel/Agenda.
    Entra por UMA fresta dolorida específica.

    Template:
    - Motor que responde: [DECISÃO] → faça / não faça / agora / depois
    - Foco: Eliminar [FRICÇÃO]
    - MVP faz UMA coisa bem
    """
    # Nome do produto (sugestão baseada no tipo)
    type_prefixes = {
        'gatekeeper': 'Gate',
        'triage': 'Sort',
        'operational_decision': 'Decide'
    }
    prefix = type_prefixes.get(product_type['type'], 'Smart')

    # Extrair palavra-chave do mercado (skip articles)
    skip_words = {'de', 'da', 'do', 'das', 'dos', 'a', 'o', 'as', 'os', 'e', 'em', 'para'}
    market_words = [w for w in market_name.lower().split() if w not in skip_words]
    market_key = market_words[0][:4].title() if market_words else 'Biz'

    suggested_name = f"{prefix}{market_key}"

    # Product definition — only if LLM provided a decision
    if dominant_decision:
        product_definition = f"Motor de decisão que responde: {dominant_decision} → faça / não faça"
        one_liner = f"{suggested_name}: motor de decisão operacional para {market_name.lower()}"
        mvp_does = [
            f"Responde automaticamente: {dominant_decision}",
            f"Saída binária: faça / não faça / agora / depois",
        ]
        if dominant_friction:
            mvp_does.append(f"Elimina a fricção: {dominant_friction}")
    else:
        product_definition = "Dados insuficientes para definir produto"
        one_liner = f"Análise inconclusiva para {market_name.lower()}"
        mvp_does = []

    # Tagline
    tagline_options = {
        'gatekeeper': "Menos erro ao aceitar. Mais margem ao recusar.",
        'triage': "Priorize sem pensar. Decida sem duvidar.",
        'operational_decision': "Pergunte. Ele responde: faça / não faça / agora / depois."
    }
    tagline = tagline_options.get(product_type['type'],
        "Pergunte. Ele responde: faça / não faça / agora / depois.") if dominant_decision else "Dados insuficientes"

    mvp_does_not = [
        "Não substitui CRM, planilha ou agenda — entra por uma fresta só",
        "Não toma decisões estratégicas do negócio",
        "Não precisa de integração para começar (funciona standalone)",
        "Não tenta resolver tudo — resolve UMA decisão muito bem"
    ] if dominant_decision else []

    # AJUSTE 2: Incluir micro-decisions no output
    return {
        'suggested_name': suggested_name,
        'product_definition': product_definition,
        'tagline': tagline,
        'one_liner': one_liner,
        'type': product_type['type'],
        'type_name': product_type['name'],
        'type_description': product_type['description'],
        'value_proposition': tagline,  # Use the new tagline as value prop
        'mvp_does': mvp_does,
        'mvp_does_not': mvp_does_not,
        'micro_decisions': micro_decisions or [],  # AJUSTE 2
        'target_market': market_name,
        'core_decision': dominant_decision,
        'core_friction': dominant_friction,
        'replaced_tools': workaround_tools,
        'd2p_score': d2p_score['total'],
        'd2p_verdict': d2p_score['verdict'],
        'is_viable': d2p_score['is_product_candidate']
    }


# ==============================================================================
# FRICTION DETECTION
# ==============================================================================

def detect_workarounds_and_decisions(
    text: str,
    market_name: str = ''
) -> List[Dict]:
    """
    Detecta workarounds (ferramentas reais) nas bios.
    Professions are no longer detected here — pipeline is blind.
    LLM is the only source of decisions.
    """
    text_lower = text.lower()
    detected_workarounds = []

    # Detectar workarounds
    for tool, data in WORKAROUND_TO_DECISION.items():
        if tool in text_lower:
            detected_workarounds.append({
                'tool': tool,
                **data
            })

    return detected_workarounds


def analyze_friction_unit(
    keywords: List[str],
    docs: List[str],
    market_name: str = ''
) -> Dict[str, Any]:
    """
    Analisa um tópico BERTopic e extrai informações de fricção D2P.
    Pipeline is blind: decision is always None here — only LLM generates decisions.
    Workarounds contribute to friction_score as metadata.
    """
    combined_text = ' '.join(keywords + docs)

    # Detectar workarounds only (no profession matching)
    workarounds = detect_workarounds_and_decisions(combined_text, market_name)

    # decision stays None — LLM is the only source of decisions
    dominant_decision = None
    dominant_friction = None
    dominant_type = 'operational_decision'

    # Calcular score de fricção (workarounds as metadata only)
    friction_score = 0.0
    if workarounds:
        friction_score += 0.3 * min(len(workarounds), 3)

    # Detectar sinais de volume/frequência
    volume_detected = any(s in combined_text.lower() for s in VOLUME_SIGNALS)
    frequency_detected = any(s in combined_text.lower() for s in FREQUENCY_SIGNALS)

    if volume_detected:
        friction_score += 0.1
    if frequency_detected:
        friction_score += 0.1

    friction_score = min(1.0, friction_score)
    is_friction = friction_score >= 0.3

    return {
        'decision': dominant_decision,
        'friction': dominant_friction,
        'product_type': dominant_type,
        'friction_score': round(friction_score, 3),
        'is_friction': is_friction,
        'detected_workarounds': [w['tool'] for w in workarounds],
        'has_volume_signal': volume_detected,
        'has_frequency_signal': frequency_detected
    }


# ==============================================================================
# AJUSTE 1 — BIO PREPROCESSING: EXTRACT OPERATIONAL PHRASES
# ==============================================================================

# Operational verbs that signal decision-making in bios
OPERATIONAL_VERBS = [
    'respondo', 'atendo', 'decido', 'fecho', 'aceito', 'recuso',
    'priorizo', 'organizo', 'gerencio', 'administro', 'controlo',
    'agendo', 'confirmo', 'cancelo', 'remarco', 'encaixo',
    'avalio', 'qualifico', 'seleciono', 'filtro', 'classifico',
    'cobro', 'negocio', 'orço', 'preciso', 'calculo',
    'envio', 'entrego', 'despacho', 'redireciono',
    'produzo', 'crio', 'desenvolvo', 'executo', 'implemento',
    'monitoro', 'acompanho', 'verifico', 'checo', 'valido',
    # Infinitives (common in bios: "ajudo a decidir", "preciso atender")
    'responder', 'atender', 'decidir', 'fechar', 'aceitar',
    'priorizar', 'organizar', 'gerenciar', 'agendar', 'confirmar',
    'avaliar', 'qualificar', 'selecionar', 'filtrar',
    'cobrar', 'negociar', 'produzir', 'criar', 'monitorar',
]

# Context nouns that give meaning to operational verbs
DECISION_CONTEXT_NOUNS = [
    'cliente', 'clientes', 'lead', 'leads', 'prospect', 'prospects',
    'paciente', 'pacientes', 'aluno', 'alunos',
    'projeto', 'projetos', 'job', 'jobs', 'trabalho',
    'proposta', 'propostas', 'orçamento', 'orçamentos',
    'agenda', 'horário', 'horários', 'prazo', 'prazos',
    'pedido', 'pedidos', 'encomenda', 'encomendas',
    'campanha', 'campanhas', 'conteúdo', 'conteúdos',
    'mensagem', 'mensagens', 'demanda', 'demandas',
    'estratégia', 'resultado', 'resultados', 'meta', 'metas',
    'equipe', 'time', 'colaborador', 'freelancer',
]


def extract_operational_phrases(bio: str) -> List[str]:
    """
    Extract operational phrases from a bio that signal decision-making.

    Instead of feeding the full bio to BERTopic (which is full of
    marketing fluff: "transformo negócios", "levo sua marca ao próximo nível"),
    extract only fragments containing operational verbs + context nouns.

    This gives BERTopic actual decision-making content to cluster,
    producing topics like "qualificar leads" vs "agendar clientes"
    instead of 2 identical generic clusters.
    """
    bio_lower = bio.lower()
    phrases = []

    # Split into sentences (rough: by punctuation and line breaks)
    sentences = re.split(r'[.!?\n|•⚡🔥✨💡🚀📲📱💼🎯✅❌➡️▶️🔸🔹]+', bio_lower)

    for sentence in sentences:
        sentence = sentence.strip()
        if len(sentence) < 5:
            continue

        has_verb = any(verb in sentence for verb in OPERATIONAL_VERBS)
        has_context = any(noun in sentence for noun in DECISION_CONTEXT_NOUNS)

        if has_verb and has_context:
            # High-value: operational verb + business context
            phrases.append(sentence.strip())
        elif has_verb:
            # Medium-value: operational verb alone
            phrases.append(sentence.strip())

    return phrases


def prepare_bertopic_docs(bios: List[str], market_name: str) -> List[str]:
    """
    Prepare documents for BERTopic by extracting operational phrases.

    Strategy:
    - For each bio, extract operational phrases
    - If a bio has operational phrases, use them (joined)
    - If not, fall back to the full bio (some signal is better than none)
    - This transforms BERTopic input from generic marketing bios
      to decision-focused text, enabling meaningful clustering.
    """
    docs = []
    extracted_count = 0

    for bio in bios:
        phrases = extract_operational_phrases(bio)
        if phrases:
            # Join operational phrases as the document
            docs.append(' | '.join(phrases))
            extracted_count += 1
        else:
            # Fallback: use full bio but trimmed
            docs.append(bio[:300] if len(bio) > 300 else bio)

    print(f"[D2P] Bio preprocessing: {extracted_count}/{len(bios)} bios had operational phrases extracted",
          file=sys.stderr)

    return docs


# ==============================================================================
# BERTOPIC
# ==============================================================================

def get_portuguese_stopwords() -> List[str]:
    return [
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
        'link', 'bio', 'instagram', 'insta', 'dm', 'direct', 'segue', 'siga',
        'clique', 'acesse', 'www', 'http', 'https', 'com', 'br', 'contato',
    ]


def create_bertopic_model(n_docs: int) -> BERTopic:
    # More aggressive clustering for homogeneous datasets
    # For 603 docs: min_cluster=10, min_samples=3 → more granular topics
    # For 2000 docs: min_cluster=25, min_samples=8
    adjusted_min_cluster = max(10, min(MIN_CLUSTER_SIZE, n_docs // 40))
    adjusted_min_samples = max(3, min(MIN_SAMPLES, adjusted_min_cluster // 3))

    # Lower n_components for smaller datasets to avoid overfitting UMAP
    adjusted_n_components = min(N_COMPONENTS, max(3, n_docs // 100))

    print(f"[D2P] BERTopic params: min_cluster={adjusted_min_cluster}, min_samples={adjusted_min_samples}, "
          f"n_components={adjusted_n_components}, n_docs={n_docs}", file=sys.stderr)

    umap_model = UMAP(
        n_neighbors=min(N_NEIGHBORS, max(2, n_docs // 10)),
        n_components=adjusted_n_components,
        min_dist=0.05,  # slightly > 0 to spread clusters apart
        metric='cosine',
        random_state=42,
        low_memory=True,
        verbose=False
    )

    hdbscan_model = HDBSCAN(
        min_cluster_size=adjusted_min_cluster,
        min_samples=adjusted_min_samples,
        metric='euclidean',
        cluster_selection_method='leaf',  # 'leaf' finds more fine-grained clusters than 'eom'
        prediction_data=True
    )

    vectorizer_model = CountVectorizer(
        stop_words=get_portuguese_stopwords(),
        min_df=2,
        max_df=1.0,
        ngram_range=(1, 2)
    )

    return BERTopic(
        umap_model=umap_model,
        hdbscan_model=hdbscan_model,
        vectorizer_model=vectorizer_model,
        representation_model=None,
        top_n_words=12,
        verbose=False,
        calculate_probabilities=False,
        language="portuguese"
    )


# ==============================================================================
# MAIN ANALYSIS
# ==============================================================================

def run_analysis(input_data: Dict) -> Dict[str, Any]:
    """
    Pipeline D2P (receives pre-filtered leads from Node.js):

    Input: leads already filtered by pgvector similarity in Node.js
    1. WORKAROUNDS → Padrões nas bios
    2. DECISÕES → Tradução workaround → decisão
    3. SCORE D2P → 5 critérios binários
    4. PRODUTO → Definição estruturada
    """
    start_time = datetime.now()

    market_name = input_data.get('market_name', 'Unknown')
    version_id = input_data.get('version_id', 'unknown')
    leads = input_data.get('leads', [])

    print(f"[D2P] === D2P Analysis: {market_name} ===", file=sys.stderr)
    print(f"[D2P] Received {len(leads)} pre-filtered leads from pgvector", file=sys.stderr)

    n_selected = len(leads)
    if n_selected < 50:
        return {
            'success': False,
            'error': f'Insufficient leads: {n_selected}. Try lowering similarity threshold.',
            'leads_selected': n_selected
        }

    # Calculate similarity stats from pre-filtered leads
    similarities = [l.get('similarity', 0) for l in leads]
    min_sim = min(similarities) if similarities else 0
    avg_sim = sum(similarities) / len(similarities) if similarities else 0

    # Step 1: Prepare bios for BERTopic
    bios = []
    all_text_combined = ""
    for lead in leads:
        bio = lead.get('bio', '') or ''
        profession = lead.get('profession', '') or ''
        if profession:
            bio = f"{profession}. {bio}"
        bios.append(bio)
        all_text_combined += " " + bio

    # Step 2: Detect global workarounds (no profession matching — pipeline is blind)
    print(f"[D2P] Detecting workarounds (market: {market_name})...", file=sys.stderr)
    global_workarounds = detect_workarounds_and_decisions(all_text_combined, market_name)

    # Step 3: Collect real professions from lead data (not hardcoded templates)
    detected_professions = list(set(
        lead.get('profession', '') for lead in leads
        if lead.get('profession')
    ))
    print(f"[D2P] Real professions from lead data: {detected_professions[:10]}", file=sys.stderr)

    # Step 4: BERTopic clustering on OPERATIONAL PHRASES (not raw bios)
    print(f"[D2P] Preprocessing bios → extracting operational phrases...", file=sys.stderr)
    bertopic_docs = prepare_bertopic_docs(bios, market_name)

    print(f"[D2P] Running BERTopic on {n_selected} preprocessed docs...", file=sys.stderr)
    model = get_sentence_model()
    bertopic_embeddings = model.encode(bertopic_docs, show_progress_bar=False, convert_to_numpy=True)

    try:
        topic_model = create_bertopic_model(n_selected)
        topics, _ = topic_model.fit_transform(bertopic_docs, bertopic_embeddings)
    except Exception as e:
        return {'success': False, 'error': f'BERTopic error: {e}'}

    # Get topic info
    topic_info = topic_model.get_topic_info()
    valid_topics = topic_info[topic_info['Topic'] != -1]

    outliers = sum(1 for t in topics if t == -1)
    coverage = (n_selected - outliers) / n_selected * 100

    # Step 5: Analyze each topic for friction
    friction_units = []
    for _, row in valid_topics.iterrows():
        topic_id = row['Topic']
        count = row['Count']

        topic_words = topic_model.get_topic(topic_id)
        keywords = [word for word, score in topic_words[:12]] if topic_words else []
        representative_docs = topic_model.get_representative_docs(topic_id) or []

        friction_analysis = analyze_friction_unit(keywords, representative_docs[:10], market_name)

        friction_unit = {
            'topic_id': int(topic_id),
            'label': row.get('Name', f'Topic_{topic_id}'),
            'count': int(count),
            'percentage': round(count / n_selected * 100, 2),
            'keywords': keywords,
            'representative_bios': representative_docs[:3],
            **friction_analysis
        }

        friction_units.append(friction_unit)

    friction_units.sort(key=lambda x: x['friction_score'], reverse=True)

    # Step 6: BUSINESS OWNER PAIN INFERENCE
    # 1. Count business-owner signals in individual bios
    # 2. Pass BERTopic topics + representative bios to LLM
    # 3. LLM infers decisions grounded in actual data
    print(f"[D2P] Scanning for business owner pain signals...", file=sys.stderr)
    bio_business_signals = count_business_signals_per_bio(bios)
    total_biz_signals = sum(bio_business_signals.values())
    print(f"[D2P] Business signals found: {total_biz_signals} total across "
          f"{len(bio_business_signals)} distinct terms", file=sys.stderr)
    if bio_business_signals:
        top_signals = sorted(bio_business_signals.items(), key=lambda x: -x[1])[:5]
        print(f"[D2P] Top business signals: {top_signals}", file=sys.stderr)

    # Collect topic keywords AND representative bios for LLM grounding
    all_topic_keywords = [fu.get('keywords', []) for fu in friction_units]
    all_representative_bios = [fu.get('representative_bios', []) for fu in friction_units]

    # Run business owner inference (LLM-powered, grounded in data)
    owner_analysis = infer_business_owner_decisions(
        market_name=market_name,
        bio_business_signals=bio_business_signals,
        n_leads=n_selected,
        topic_keywords=all_topic_keywords,
        representative_bios=all_representative_bios,
    )
    owner_decisions = owner_analysis['owner_decisions']
    print(f"[D2P] Owner decisions inferred: {len(owner_decisions)}", file=sys.stderr)
    for i, od in enumerate(owner_decisions[:3]):
        print(f"[D2P]   #{i+1}: {od['decision']} (weight={od['weight']:.1f})", file=sys.stderr)

    # Step 7: Calculate D2P Binary Score (proportional, not concatenated)
    print(f"[D2P] Calculating D2P score (proportional across {n_selected} bios)...", file=sys.stderr)
    d2p_score = calculate_d2p_binary_score(
        global_workarounds,
        bios,
        n_selected
    )

    # Step 8: Determine product type (workarounds only, no profession templates)
    product_type = determine_product_type(global_workarounds)

    # Step 9: Get dominant decision and friction — ONLY from LLM
    dominant_decision = None
    dominant_friction = None

    if owner_decisions:
        top_owner = owner_decisions[0]
        dominant_decision = top_owner['decision']
        dominant_friction = top_owner['friction']
        product_type_override = top_owner.get('product_type')
        if product_type_override:
            product_type['type'] = product_type_override

    # No fallback. If LLM didn't find decisions, output stays None.
    if not dominant_decision:
        print(f"[D2P] No dominant decision — insufficient data for this market", file=sys.stderr)

    workaround_tools = list(set(
        w['tool'] for w in global_workarounds
    ))[:5]

    # Step 10: Micro-decisions — ONLY from LLM owner decisions (no hardcoded templates)
    micro_decisions = [od['decision'] for od in owner_decisions[1:]][:6]

    print(f"[D2P] Micro-decisions: {len(micro_decisions)} (all from LLM)", file=sys.stderr)

    # Step 11: Generate product definition
    print(f"[D2P] Generating product definition...", file=sys.stderr)
    product = generate_product_definition(
        market_name=market_name,
        dominant_decision=dominant_decision,
        dominant_friction=dominant_friction,
        product_type=product_type,
        workaround_tools=workaround_tools,
        d2p_score=d2p_score,
        micro_decisions=micro_decisions,
    )

    # Metrics
    friction_count = sum(1 for f in friction_units if f['is_friction'])
    total_friction_score = sum(f['friction_score'] for f in friction_units)
    avg_friction_score = total_friction_score / len(friction_units) if friction_units else 0
    friction_density = friction_count / len(friction_units) if friction_units else 0

    duration_ms = int((datetime.now() - start_time).total_seconds() * 1000)

    print(f"[D2P] Analysis complete in {duration_ms}ms", file=sys.stderr)
    print(f"[D2P] Product: {product['suggested_name']} ({product['type']})", file=sys.stderr)
    print(f"[D2P] D2P Score: {d2p_score['total']}/5 - {d2p_score['verdict']}", file=sys.stderr)

    return {
        'success': True,
        'market_name': market_name,
        'version_id': version_id,
        'search_mode': 'identity',

        # Search stats (from pgvector, passed through)
        'leads_selected': n_selected,
        'similarity_threshold': round(min_sim, 4),
        'avg_similarity': round(avg_sim, 4),

        # BERTopic results
        'topics_discovered': len(valid_topics),
        'topics_detail': [
            {'topic_id': int(row['Topic']), 'label': row.get('Name', ''), 'count': int(row['Count'])}
            for _, row in valid_topics.iterrows()
        ],
        'coverage_percentage': round(coverage, 2),
        'friction_units': friction_units,

        # Metrics
        'friction_count': friction_count,
        'total_friction_score': round(total_friction_score, 3),
        'avg_friction_score': round(avg_friction_score, 3),
        'friction_density': round(friction_density, 3),

        # D2P Core
        'dominant_pain': dominant_friction,
        'dominant_decision': dominant_decision,
        'product_type': product['type'],
        'product_type_name': product['type_name'],

        # Product Definition
        'product': product,

        # D2P Binary Score
        'd2p_binary_score': d2p_score,

        # Legacy compatibility
        'product_potential_score': d2p_score['total'] * 20,
        'product_definition': product['product_definition'],
        'product_tagline': product['tagline'],
        'mvp_does': product['mvp_does'],
        'mvp_does_not': product['mvp_does_not'],
        'd2p_score': {
            'frequency': d2p_score['scores']['frequency'],
            'volume': d2p_score['scores']['volume'],
            'manual': d2p_score['scores']['manual'],
            'cost': d2p_score['scores']['cost'],
            'rule': d2p_score['scores']['rule'],
            'total': d2p_score['total']
        },
        'workaround_tools': workaround_tools,

        # Detected
        'detected_workarounds': [w['tool'] for w in global_workarounds],
        'detected_professions': detected_professions,

        # Business Owner Analysis (the real pain)
        'owner_analysis': {
            'decisions': [
                {'decision': od['decision'], 'friction': od['friction'],
                 'type': od['product_type'], 'weight': round(od['weight'], 2)}
                for od in owner_decisions
            ],
            'evidence': owner_analysis['evidence'],
            'is_intermediary': owner_analysis['is_intermediary'],
            'business_signals': owner_analysis['business_signal_counts'],
        },

        # Micro-decisions (LLM only, no templates)
        'micro_decisions': micro_decisions,

        # Meta
        'analysis_duration_ms': duration_ms
    }


# ==============================================================================
# ENTRY POINT
# ==============================================================================

if __name__ == '__main__':
    try:
        input_text = sys.stdin.read()
        input_data = json.loads(input_text) if input_text.strip() else {}

        result = run_analysis(input_data)
        print(json.dumps(result, ensure_ascii=False))

    except json.JSONDecodeError as e:
        print(json.dumps({
            'success': False,
            'error': f'Invalid JSON input: {str(e)}'
        }))
        sys.exit(1)
    except Exception as e:
        print(json.dumps({
            'success': False,
            'error': f'Unexpected error: {str(e)}'
        }))
        sys.exit(1)

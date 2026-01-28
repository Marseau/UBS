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
from datetime import datetime
from typing import List, Dict, Any, Tuple

try:
    from bertopic import BERTopic
    from umap import UMAP
    from hdbscan import HDBSCAN
    from sklearn.feature_extraction.text import CountVectorizer
    from sentence_transformers import SentenceTransformer
except ImportError as e:
    print(json.dumps({"success": False, "error": f"Missing dependency: {e}"}))
    sys.exit(1)

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

# Profissões → Fricções operacionais conhecidas
PROFESSION_DECISIONS = {
    # Saúde
    'dentista': {
        'decision': 'Encaixo esse paciente de urgência?',
        'friction': 'Gestão de agenda com imprevistos',
        'product_type': 'gatekeeper',
        'category': 'health'
    },
    'médico': {
        'decision': 'Esse paciente precisa de retorno?',
        'friction': 'Acompanhamento de pacientes',
        'product_type': 'operational_decision',
        'category': 'health'
    },
    'nutricionista': {
        'decision': 'O paciente está seguindo o plano?',
        'friction': 'Monitoramento de aderência',
        'product_type': 'operational_decision',
        'category': 'health'
    },
    'psicólogo': {
        'decision': 'Remarco essa sessão?',
        'friction': 'Gestão de faltas e remarcações',
        'product_type': 'gatekeeper',
        'category': 'health'
    },
    'fisioterapeuta': {
        'decision': 'Quantas sessões esse paciente precisa?',
        'friction': 'Planejamento de tratamento',
        'product_type': 'operational_decision',
        'category': 'health'
    },

    # Beleza
    'cabeleireiro': {
        'decision': 'Tenho horário para esse procedimento?',
        'friction': 'Encaixe de serviços com durações diferentes',
        'product_type': 'gatekeeper',
        'category': 'beauty'
    },
    'esteticista': {
        'decision': 'Qual protocolo indicar?',
        'friction': 'Personalização de tratamentos',
        'product_type': 'operational_decision',
        'category': 'beauty'
    },
    'manicure': {
        'decision': 'Confirmo esse horário?',
        'friction': 'Confirmação e no-shows',
        'product_type': 'gatekeeper',
        'category': 'beauty'
    },
    'maquiador': {
        'decision': 'Aceito esse job?',
        'friction': 'Avaliação de oportunidades',
        'product_type': 'gatekeeper',
        'category': 'beauty'
    },

    # Fitness
    'personal': {
        'decision': 'Ajusto o treino desse aluno?',
        'friction': 'Personalização contínua',
        'product_type': 'operational_decision',
        'category': 'fitness'
    },

    # Educação/Coaching
    'professor': {
        'decision': 'Esse aluno precisa de reforço?',
        'friction': 'Identificação de dificuldades',
        'product_type': 'triage',
        'category': 'education'
    },
    'coach': {
        'decision': 'Esse coachee está progredindo?',
        'friction': 'Monitoramento de evolução',
        'product_type': 'operational_decision',
        'category': 'coaching'
    },
    'mentor': {
        'decision': 'Aceito esse mentorado?',
        'friction': 'Seleção de clientes',
        'product_type': 'gatekeeper',
        'category': 'coaching'
    },

    # Criativos
    'fotógrafo': {
        'decision': 'Aceito esse ensaio?',
        'friction': 'Avaliação de jobs',
        'product_type': 'gatekeeper',
        'category': 'creative'
    },
    'designer': {
        'decision': 'Esse briefing está claro?',
        'friction': 'Validação de escopo',
        'product_type': 'triage',
        'category': 'creative'
    },
    'tatuador': {
        'decision': 'Faço esse desenho?',
        'friction': 'Aceitação de projetos',
        'product_type': 'gatekeeper',
        'category': 'creative'
    },

    # Jurídico
    'advogado': {
        'decision': 'Aceito esse caso?',
        'friction': 'Avaliação de viabilidade jurídica',
        'product_type': 'gatekeeper',
        'category': 'legal'
    },

    # Alimentação
    'confeiteiro': {
        'decision': 'Consigo entregar essa encomenda?',
        'friction': 'Gestão de capacidade produtiva',
        'product_type': 'gatekeeper',
        'category': 'food'
    },
    'chef': {
        'decision': 'Aceito esse evento?',
        'friction': 'Avaliação de oportunidades',
        'product_type': 'gatekeeper',
        'category': 'food'
    },

    # Imóveis
    'corretor': {
        'decision': 'Esse cliente é qualificado?',
        'friction': 'Qualificação de compradores',
        'product_type': 'triage',
        'category': 'real_estate'
    },

    # Contabilidade
    'contador': {
        'decision': 'Aceito esse cliente?',
        'friction': 'Avaliação de complexidade',
        'product_type': 'gatekeeper',
        'category': 'accounting'
    },

    # Consultoria/Marketing
    'consultor': {
        'decision': 'Esse projeto cabe no meu modelo?',
        'friction': 'Fit de projeto',
        'product_type': 'triage',
        'category': 'consulting'
    },
    'gestor de tráfego': {
        'decision': 'Essa conta tem potencial?',
        'friction': 'Qualificação de clientes',
        'product_type': 'triage',
        'category': 'marketing'
    },
    'social media': {
        'decision': 'Produzo conteúdo sobre isso?',
        'friction': 'Priorização de pautas',
        'product_type': 'operational_decision',
        'category': 'marketing'
    },

    # Tech
    'programador': {
        'decision': 'Aceito esse freela?',
        'friction': 'Avaliação de projetos',
        'product_type': 'gatekeeper',
        'category': 'tech'
    },
    'desenvolvedor': {
        'decision': 'Esse escopo está viável?',
        'friction': 'Estimativa de esforço',
        'product_type': 'operational_decision',
        'category': 'tech'
    },

    # Pets
    'veterinário': {
        'decision': 'Esse caso é urgência?',
        'friction': 'Triagem de atendimentos',
        'product_type': 'triage',
        'category': 'veterinary'
    },

    # Varejo
    'lojista': {
        'decision': 'Reponho esse produto?',
        'friction': 'Gestão de estoque',
        'product_type': 'operational_decision',
        'category': 'retail'
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
# D2P SCORE - 5 CRITÉRIOS BINÁRIOS
# ==============================================================================

def calculate_d2p_binary_score(
    detected_workarounds: List[Dict],
    detected_professions: List[Dict],
    all_text: str
) -> Dict[str, Any]:
    """
    Score D2P com 5 critérios binários.

    Critérios:
    1. frequency: Acontece todo dia?
    2. volume: Acontece várias vezes por dia?
    3. manual: Depende de humano decidir?
    4. cost: Erro custa tempo ou dinheiro?
    5. rule: Dá pra transformar em regra simples?

    Score >= 4 = produto candidato forte
    """
    text_lower = all_text.lower()

    # 1. FREQUENCY: Detectar sinais de frequência diária
    frequency = any(signal in text_lower for signal in FREQUENCY_SIGNALS)
    # Também considerar se tem profissões que tipicamente têm demanda diária
    if detected_professions:
        daily_professions = ['dentista', 'cabeleireiro', 'personal', 'veterinário']
        if any(p['profession'] in daily_professions for p in detected_professions):
            frequency = True

    # 2. VOLUME: Detectar sinais de alto volume
    volume = any(signal in text_lower for signal in VOLUME_SIGNALS)
    # Workarounds de triage indicam volume
    if any(w['product_type'] == 'triage' for w in detected_workarounds):
        volume = True

    # 3. MANUAL: Detectar sinais de processo manual
    manual = any(signal in text_lower for signal in MANUAL_SIGNALS)
    # Qualquer workaround detectado indica processo manual
    if detected_workarounds:
        manual = True

    # 4. COST: Erro custa tempo ou dinheiro?
    # Gatekeepers têm custo alto de erro (aceitar cliente errado)
    cost = any(w['product_type'] == 'gatekeeper' for w in detected_workarounds)
    # Profissões de serviço têm custo de oportunidade
    if detected_professions:
        high_cost_categories = ['health', 'legal', 'consulting', 'coaching']
        if any(p.get('category') in high_cost_categories for p in detected_professions):
            cost = True

    # 5. RULE: Dá pra transformar em regra simples?
    # Se tem workaround de triage ou gatekeeper, provavelmente sim
    rule = any(w['product_type'] in ['triage', 'gatekeeper'] for w in detected_workarounds)
    # Se a decisão é binária (aceito/não aceito), sim
    if detected_professions:
        for p in detected_professions:
            if 'aceito' in p.get('decision', '').lower():
                rule = True
                break

    # Calcular total
    scores = {
        'frequency': frequency,
        'volume': volume,
        'manual': manual,
        'cost': cost,
        'rule': rule
    }
    total = sum(1 for v in scores.values() if v)

    # Determinar se é produto candidato
    is_product_candidate = total >= 4
    verdict = "EXCELENTE" if total >= 4 else "MODERADO" if total >= 3 else "FRACO"

    return {
        'scores': scores,
        'total': total,
        'max_score': 5,
        'is_product_candidate': is_product_candidate,
        'verdict': verdict,
        'explanation': {
            'frequency': "Acontece diariamente" if frequency else "Não é diário",
            'volume': "Alto volume de ocorrências" if volume else "Volume baixo/moderado",
            'manual': "Depende de decisão humana" if manual else "Já automatizado",
            'cost': "Erro tem custo significativo" if cost else "Erro tem baixo impacto",
            'rule': "Pode ser regra simples" if rule else "Requer análise complexa"
        }
    }


# ==============================================================================
# PRODUCT DEFINITION
# ==============================================================================

def determine_product_type(workarounds: List[Dict], professions: List[Dict]) -> Dict[str, Any]:
    """
    Determina tipo de produto:
    - GATEKEEPER: Protege recursos escassos (agenda, estoque, capacidade)
    - TRIAGE: Classifica entradas caóticas (leads, pedidos, mensagens)
    - OPERATIONAL_DECISION: Decide ações operacionais (aceitar, recusar, priorizar)
    """
    type_counts = {'gatekeeper': 0, 'triage': 0, 'operational_decision': 0}

    for w in workarounds:
        ptype = w.get('product_type', 'operational_decision')
        type_counts[ptype] = type_counts.get(ptype, 0) + 1

    for p in professions:
        ptype = p.get('product_type', 'operational_decision')
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
    d2p_score: Dict
) -> Dict[str, Any]:
    """
    Gera definição estruturada do produto.

    Template:
    - Produto: Sistema que decide [DECISÃO] automaticamente
    - Foco: Eliminar [FRICÇÃO]
    - MVP faz / não faz
    """
    # Nome do produto (sugestão baseada no tipo)
    type_prefixes = {
        'gatekeeper': 'Gate',
        'triage': 'Sort',
        'operational_decision': 'Auto'
    }
    prefix = type_prefixes.get(product_type['type'], 'Smart')

    # Extrair palavra-chave do mercado
    market_words = market_name.lower().split()
    market_key = market_words[0][:4].title() if market_words else 'Biz'

    suggested_name = f"{prefix}{market_key}"

    # Definição formal
    product_definition = f"Sistema que decide automaticamente: {dominant_decision}"

    # Tagline
    decision_verb = dominant_decision.split()[0].lower() if dominant_decision else "decidir"
    tagline = f"Pare de {decision_verb} manualmente"

    # One-liner
    one_liner = f"{suggested_name}: {product_type['value_prop']} para {market_name.lower()}"

    # MVP FAZ
    mvp_does = [
        f"Automatiza a decisão: {dominant_decision}",
        f"Elimina fricção: {dominant_friction}",
        f"Substitui: {', '.join(workaround_tools[:2]) if workaround_tools else 'processo manual'}"
    ]

    # Adicionar capacidade específica por tipo
    if product_type['type'] == 'gatekeeper':
        mvp_does.append("Protege seu recurso mais escasso automaticamente")
    elif product_type['type'] == 'triage':
        mvp_does.append("Classifica e prioriza entradas por critérios definidos")
    else:
        mvp_does.append("Responde perguntas operacionais rotineiras")

    # MVP NÃO FAZ
    mvp_does_not = [
        "Não substitui decisões estratégicas do negócio",
        "Não requer integração complexa para começar",
        "Não precisa de treinamento extenso",
        "Não toma decisões que só humano pode tomar"
    ]

    return {
        'suggested_name': suggested_name,
        'product_definition': product_definition,
        'tagline': tagline,
        'one_liner': one_liner,
        'type': product_type['type'],
        'type_name': product_type['name'],
        'type_description': product_type['description'],
        'value_proposition': product_type['value_prop'],
        'mvp_does': mvp_does,
        'mvp_does_not': mvp_does_not,
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

def detect_workarounds_and_decisions(text: str) -> Tuple[List[Dict], List[Dict]]:
    """
    Detecta workarounds e traduz para decisões.
    """
    text_lower = text.lower()
    detected_workarounds = []
    detected_professions = []

    # Detectar workarounds
    for tool, data in WORKAROUND_TO_DECISION.items():
        if tool in text_lower:
            detected_workarounds.append({
                'tool': tool,
                **data
            })

    # Detectar profissões
    for profession, data in PROFESSION_DECISIONS.items():
        if profession in text_lower:
            detected_professions.append({
                'profession': profession,
                **data
            })

    return detected_workarounds, detected_professions


def analyze_friction_unit(keywords: List[str], docs: List[str]) -> Dict[str, Any]:
    """
    Analisa um tópico BERTopic e extrai informações de fricção D2P.
    """
    combined_text = ' '.join(keywords + docs)

    # Detectar workarounds e profissões
    workarounds, professions = detect_workarounds_and_decisions(combined_text)

    # Determinar decisão dominante
    dominant_decision = None
    dominant_friction = None
    dominant_type = 'operational_decision'

    # Priorizar profissões (mais específicas)
    if professions:
        top_prof = professions[0]
        dominant_decision = top_prof['decision']
        dominant_friction = top_prof['friction']
        dominant_type = top_prof['product_type']
    elif workarounds:
        top_work = workarounds[0]
        dominant_decision = top_work['decision']
        dominant_friction = top_work['friction']
        dominant_type = top_work['product_type']
    else:
        # Fallback genérico
        dominant_decision = "Como priorizo essa atividade?"
        dominant_friction = "Falta de critério de priorização"

    # Calcular score de fricção
    friction_score = 0.0
    if professions:
        friction_score += 0.5
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
        'detected_professions': [p['profession'] for p in professions],
        'has_volume_signal': volume_detected,
        'has_frequency_signal': frequency_detected
    }


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
    adjusted_min_cluster = max(15, min(MIN_CLUSTER_SIZE, n_docs // 20))
    adjusted_min_samples = max(5, min(MIN_SAMPLES, adjusted_min_cluster // 2))

    umap_model = UMAP(
        n_neighbors=min(N_NEIGHBORS, max(2, n_docs // 10)),
        n_components=N_COMPONENTS,
        min_dist=0.0,
        metric='cosine',
        random_state=42,
        low_memory=True,
        verbose=False
    )

    hdbscan_model = HDBSCAN(
        min_cluster_size=adjusted_min_cluster,
        min_samples=adjusted_min_samples,
        metric='euclidean',
        cluster_selection_method='eom',
        prediction_data=True
    )

    vectorizer_model = CountVectorizer(
        stop_words=get_portuguese_stopwords(),
        min_df=2,
        max_df=0.95,
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

    # Step 2: Detect global workarounds and professions
    print(f"[D2P] Detecting workarounds and decisions...", file=sys.stderr)
    global_workarounds, global_professions = detect_workarounds_and_decisions(all_text_combined)

    # Step 3: BERTopic clustering
    print(f"[D2P] Running BERTopic on {n_selected} leads...", file=sys.stderr)
    model = get_sentence_model()
    bertopic_embeddings = model.encode(bios, show_progress_bar=False, convert_to_numpy=True)

    try:
        topic_model = create_bertopic_model(n_selected)
        topics, _ = topic_model.fit_transform(bios, bertopic_embeddings)
    except Exception as e:
        return {'success': False, 'error': f'BERTopic error: {e}'}

    # Get topic info
    topic_info = topic_model.get_topic_info()
    valid_topics = topic_info[topic_info['Topic'] != -1]

    outliers = sum(1 for t in topics if t == -1)
    coverage = (n_selected - outliers) / n_selected * 100

    # Step 4: Analyze each topic for friction
    friction_units = []
    for _, row in valid_topics.iterrows():
        topic_id = row['Topic']
        count = row['Count']

        topic_words = topic_model.get_topic(topic_id)
        keywords = [word for word, score in topic_words[:12]] if topic_words else []
        representative_docs = topic_model.get_representative_docs(topic_id) or []

        friction_analysis = analyze_friction_unit(keywords, representative_docs[:10])

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

    # Step 5: Calculate D2P Binary Score
    print(f"[D2P] Calculating D2P score...", file=sys.stderr)
    d2p_score = calculate_d2p_binary_score(
        global_workarounds,
        global_professions,
        all_text_combined
    )

    # Step 6: Determine product type
    product_type = determine_product_type(global_workarounds, global_professions)

    # Step 7: Get dominant decision and friction
    dominant_decision = None
    dominant_friction = None

    for fu in friction_units:
        if fu.get('decision'):
            dominant_decision = fu['decision']
            dominant_friction = fu['friction']
            break

    if not dominant_decision:
        if global_professions:
            dominant_decision = global_professions[0]['decision']
            dominant_friction = global_professions[0]['friction']
        elif global_workarounds:
            dominant_decision = global_workarounds[0]['decision']
            dominant_friction = global_workarounds[0]['friction']
        else:
            dominant_decision = "Como priorizo minhas atividades?"
            dominant_friction = "Falta de critério de priorização"

    workaround_tools = list(set(
        w['tool'] for w in global_workarounds
    ))[:5]

    # Step 8: Generate product definition
    print(f"[D2P] Generating product definition...", file=sys.stderr)
    product = generate_product_definition(
        market_name=market_name,
        dominant_decision=dominant_decision,
        dominant_friction=dominant_friction,
        product_type=product_type,
        workaround_tools=workaround_tools,
        d2p_score=d2p_score
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
        'detected_professions': [p['profession'] for p in global_professions],

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

# 📊 Sistema de Inteligência de Hashtags

**Data de Implementação**: 2025-11-12
**Hashtags Capturadas**: 26.210 únicas | 49.669 ocorrências
**Cobertura**: 96,5% dos leads (5.591 de 5.794)

---

## 🎯 Visão Geral

Sistema completo de análise, scoring e expansão automática de termos de scraping baseado em **26.210 hashtags únicas** extraídas de 5.794 leads do Instagram.

### **Componentes Implementados**

1. ✅ **Dashboard de Análise SQL** - 10 queries prontas para análise profunda
2. ✅ **Auto-Scraping por Co-ocorrência** - Sugestões inteligentes de novos termos
3. ✅ **Sistema de Scoring por Cluster** - Classificação de leads por potencial
4. ✅ **Expansão Automática de Termos** - Descoberta de 50+ novos termos

---

## 📁 Arquivos Criados

### **Serviços**
- `src/services/hashtag-analytics-dashboard.sql` - 10 queries SQL prontas
- `src/services/hashtag-cooccurrence-suggester.service.ts` - Sugestões por co-ocorrência
- `src/services/hashtag-lead-scorer.service.ts` - Sistema de scoring
- `src/services/hashtag-search-terms-expander.service.ts` - Expansão de termos

### **Rotas API**
- `src/routes/hashtag-suggestions.routes.ts` - `/api/hashtag-suggestions/*`
- `src/routes/hashtag-scoring.routes.ts` - `/api/hashtag-scoring/*`
- `src/routes/hashtag-expansion.routes.ts` - `/api/hashtag-expansion/*`

---

## 🔥 1. Dashboard de Análise de Hashtags

### **Arquivo**: `src/services/hashtag-analytics-dashboard.sql`

**10 queries SQL prontas para executar no Supabase:**

#### **Query 1: Overview Geral**
```sql
-- Total de leads, cobertura, distribuição
SELECT COUNT(*) as total_leads, ...
```
**Use para**: Visão geral da base de dados

#### **Query 2: Top 50 Hashtags por Frequência**
```sql
-- Hashtags mais usadas nos posts
WITH post_hashtags AS (...)
```
**Use para**: Identificar hashtags populares

#### **Query 3: Hashtags Premium (Melhor Taxa de Contato)**
```sql
-- Hashtags com maior % de email/telefone
-- Mínimo 20 leads para relevância estatística
```
**Use para**: Priorizar hashtags com leads de qualidade

**Top 5 Premium**:
- `#odontologia` - 71,9% contato, 32 leads
- `#inss` - 71,4% contato, 35 leads
- `#treino` - 71,1% contato, 38 leads
- `#arquitetura` - 71,1% contato, 38 leads
- `#justiça` - 69,2% contato, 39 leads

#### **Query 4: Co-ocorrência de Hashtags**
```sql
-- Pares de hashtags que aparecem juntas
-- Mínimo 10 co-ocorrências
```
**Use para**: Descobrir relações entre hashtags

**Top Pares**:
- `#empreendedorismo + #marketingdigital` → 56x
- `#autoconhecimento + #espiritualidade` → 54x
- `#contabilidade + #empreendedorismo` → 53x

#### **Query 5: Análise por Cluster**
```sql
-- Agrupa hashtags em 5 clusters de negócio
CASE WHEN ... THEN 'Empreendedorismo & Negócios'
```
**Use para**: Segmentar leads por tipo de negócio

**5 Clusters Identificados**:
1. Empreendedorismo & Negócios
2. Saúde & Bem-estar
3. Fitness & Estética
4. Jurídico & Contábil
5. Serviços Especializados

#### **Query 6: Origem dos Leads por Search Term**
```sql
-- Analisa quais termos geraram mais leads
```
**Use para**: Otimizar estratégia de scraping

#### **Query 7: Hashtags Inexploradas (Alto Potencial)**
```sql
-- Hashtags frequentes que NÃO foram usadas como search_term
```
**Use para**: Descobrir oportunidades de expansão

#### **Query 8: Estatísticas por Faixa de Seguidores**
```sql
-- Nano (0-1k), Micro (1k-10k), Mid (10k-100k), ...
```
**Use para**: Análise demográfica

#### **Query 9: Hashtags por Mês (Tendências)**
```sql
-- Evolução temporal de uso de hashtags
```
**Use para**: Identificar tendências sazonais

#### **Query 10: Sugestões de Expansão**
```sql
-- Para cada hashtag scrapeada, sugere hashtags relacionadas
```
**Use para**: Planejamento de próximas campanhas

---

## 🤖 2. Auto-Scraping por Co-ocorrência

### **Endpoints**

#### **POST** `/api/hashtag-suggestions/from-hashtags`
Sugere novos termos baseado em lista de hashtags

```json
{
  "hashtags": ["empreendedorismo", "marketingdigital"],
  "min_cooccurrence": 10,
  "max_suggestions": 20
}
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "input_hashtags": ["empreendedorismo", "marketingdigital"],
    "total_suggestions": 15,
    "high_confidence": [
      {
        "hashtag": "vendas",
        "cooccurrence_count": 45,
        "confidence_score": 0.85,
        "estimated_leads": 120,
        "already_scraped": false
      }
    ]
  }
}
```

#### **POST** `/api/hashtag-suggestions/from-lead`
Sugere termos baseado nas hashtags de um lead

```json
{
  "lead_id": "uuid-do-lead",
  "auto_add": false
}
```

#### **POST** `/api/hashtag-suggestions/from-batch`
Análise consolidada de múltiplos leads

```json
{
  "lead_ids": ["uuid1", "uuid2"],
  "consolidate": true
}
```

### **Como Usar no N8N**

1. Após scrapear uma tag, pegue os IDs dos leads
2. Chame `/from-batch` com os IDs
3. Receba sugestões de hashtags relacionadas
4. Adicione à fila de scraping

---

## 📊 3. Sistema de Scoring por Cluster

### **5 Clusters de Negócio**

#### **Cluster 1: Empreendedorismo & Negócios**
- **Priority Score**: 85
- **Taxa de Contato**: 62%
- **Hashtags**: empreendedorismo, marketingdigital, vendas, gestaoempresarial, tecnologia (15 total)

#### **Cluster 2: Saúde & Bem-estar**
- **Priority Score**: 80
- **Taxa de Contato**: 64%
- **Hashtags**: autoconhecimento, autocuidado, psicologia, terapia, espiritualidade (16 total)

#### **Cluster 3: Fitness & Estética**
- **Priority Score**: 90
- **Taxa de Contato**: 69%
- **Hashtags**: treino, academia, emagrecimento, nutricao, estetica (15 total)

#### **Cluster 4: Jurídico & Contábil**
- **Priority Score**: 95
- **Taxa de Contato**: 68%
- **Hashtags**: advocacia, direito, contabilidade, inss, mei (13 total)

#### **Cluster 5: Serviços Especializados** 🔥
- **Priority Score**: 100
- **Taxa de Contato**: 71%
- **Hashtags**: odontologia, arquitetura, fisioterapia, medicina, design (12 total)

### **Endpoints**

#### **POST** `/api/hashtag-scoring/score-lead`
Calcula score completo para um lead

```json
{
  "lead_id": "uuid-do-lead"
}
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "lead_id": "uuid",
    "username": "exemplo_user",
    "total_score": 87,
    "cluster": "Serviços Especializados",
    "cluster_confidence": 78,
    "contact_quality_score": 70,
    "audience_quality_score": 85,
    "hashtag_match_score": 92,
    "business_potential": "Alto",
    "priority": "P0",
    "recommendations": [
      "🔥 PRIORIDADE MÁXIMA: Lead premium",
      "💎 Segmento premium: Oferecer demo personalizada"
    ]
  }
}
```

#### **POST** `/api/hashtag-scoring/score-batch`
Score para múltiplos leads com sumário

```json
{
  "lead_ids": ["uuid1", "uuid2", "uuid3"]
}
```

#### **GET** `/api/hashtag-scoring/analyze-clusters`
Análise completa de todos os clusters

**Resposta**:
```json
{
  "success": true,
  "data": [
    {
      "cluster_name": "Serviços Especializados",
      "total_leads": 150,
      "avg_score": 88,
      "top_leads": [...],
      "hashtag_distribution": [...]
    }
  ]
}
```

#### **POST** `/api/hashtag-scoring/update-lead-score`
Atualiza score no banco de dados

```json
{
  "lead_id": "uuid"
}
```

#### **POST** `/api/hashtag-scoring/score-all`
⚠️ **ADMIN ONLY**: Score em massa (processo pesado)

```json
{
  "batch_size": 100
}
```

#### **GET** `/api/hashtag-scoring/clusters`
Lista todos os clusters disponíveis

### **Fórmula de Scoring**

```typescript
total_score = (
  cluster_priority * 0.3 +       // 30% peso
  contact_quality * 0.3 +         // 30% peso
  audience_quality * 0.2 +        // 20% peso
  hashtag_match * 0.2             // 20% peso
)
```

**Contact Quality** (0-100):
- Email: +30
- Telefone: +30
- Business Account: +20
- Verified: +10
- Website: +10

**Audience Quality** (0-100):
- Followers (1k-100k faixa ideal): +40
- Posts (50+): +30
- Ratio followers/following (2+): +30

**Prioridades**:
- **P0** (90-100): Lead premium, abordar imediatamente
- **P1** (75-89): Alta prioridade, campanha prioritária
- **P2** (60-74): Prioridade média, campanha regular
- **P3** (<60): Baixa prioridade, nurturing longo prazo

---

## 🚀 4. Expansão Automática de Termos

### **3 Estratégias de Expansão**

#### **Estratégia 1: Por Frequência**
Hashtags que aparecem com maior frequência na base

```bash
POST /api/hashtag-expansion/expand-from-frequency
{
  "min_frequency": 20,
  "limit": 50
}
```

#### **Estratégia 2: Por Clusters**
Hashtags definidas nos 5 clusters que ainda não foram scrapeadas

```bash
POST /api/hashtag-expansion/expand-from-clusters
```

#### **Estratégia 3: Por Co-ocorrência**
Hashtags que aparecem junto com termos já scrapeados

```bash
POST /api/hashtag-expansion/expand-from-cooccurrence
{
  "min_cooccurrence": 15
}
```

### **Expansão Completa**

#### **POST** `/api/hashtag-expansion/expand-all`
Executa as 3 estratégias e consolida resultados

```json
{
  "auto_add": false  // true para adicionar automaticamente
}
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "total_suggested": 87,
    "new_terms": [
      {
        "term": "odontologia",
        "source": "cluster",
        "priority": 100,
        "estimated_leads": 32,
        "already_exists": false,
        "cluster": "Serviços Especializados"
      }
    ],
    "existing_terms": [...],
    "added_to_database": 0
  }
}
```

### **Exportação para N8N**

#### **GET** `/api/hashtag-expansion/export-for-n8n?limit=50`
Retorna array simples de termos priorizados

**Resposta**:
```json
{
  "success": true,
  "data": [
    "odontologia",
    "arquitetura",
    "planejamentofinanceiro",
    "estetica",
    "fisioterapia",
    ...
  ],
  "total": 50,
  "format": "array_of_strings",
  "usage": "Use este array no N8N loop para scraping sequencial"
}
```

**Como usar no N8N**:
1. HTTP Request para `/export-for-n8n?limit=30`
2. Loop nos termos retornados
3. Chamar scraper para cada termo

### **Relatório de Expansão**

#### **GET** `/api/hashtag-expansion/generate-report`
Gera relatório completo em Markdown

**Resposta**:
```json
{
  "success": true,
  "data": {
    "report_markdown": "# Relatório de Expansão...",
    "generated_at": "2025-11-12T..."
  }
}
```

---

## 📋 Exemplos de Uso

### **Caso 1: Descobrir Novos Termos Após Scrapear Tag**

```bash
# 1. Scrapear tag "empreendedorismo"
POST /api/instagram-scraper/scrape-tag
{
  "tag": "empreendedorismo"
}

# 2. Obter IDs dos leads scrapeados (via query Supabase)
# leads_ids = ["uuid1", "uuid2", ...]

# 3. Gerar sugestões baseadas nesses leads
POST /api/hashtag-suggestions/from-batch
{
  "lead_ids": ["uuid1", "uuid2", "uuid3"],
  "consolidate": true
}

# 4. Resposta com sugestões priorizadas
# → vendas, marketingdigital, gestaoempresarial
```

### **Caso 2: Priorizar Leads para Outreach**

```bash
# 1. Score em lote
POST /api/hashtag-scoring/score-batch
{
  "lead_ids": ["uuid1", "uuid2", "uuid3"]
}

# 2. Resposta com leads classificados
# P0: 5 leads (prioridade máxima)
# P1: 12 leads (alta prioridade)
# P2: 8 leads (média)

# 3. Abordar leads P0 primeiro
```

### **Caso 3: Expansão Mensal de Termos**

```bash
# Rodar 1x por mês
POST /api/hashtag-expansion/expand-all
{
  "auto_add": false
}

# Resultado: 50+ novos termos sugeridos
# Revisar manualmente e adicionar ao scraper
```

---

## 🎯 Workflows N8N Recomendados

### **Workflow 1: Scraping Inteligente com Auto-Expansão**

```
1. Trigger: Cron (1x por semana)
2. HTTP: GET /api/hashtag-expansion/export-for-n8n?limit=10
3. Loop: Para cada termo do array
4. HTTP: POST /api/instagram-scraper/scrape-tag
5. HTTP: POST /api/hashtag-suggestions/from-batch
6. Switch: Se alta confiança > 3 sugestões
7. Add to Queue: Adicionar à próxima execução
```

### **Workflow 2: Enrichment com Scoring**

```
1. Trigger: Novo lead criado (Webhook/Poll)
2. HTTP: POST /api/hashtag-scoring/score-lead
3. Switch: Baseado em priority
   - P0 → Notificar vendedor imediatamente
   - P1 → Adicionar a campanha prioritária
   - P2 → Campanha regular
   - P3 → Nurturing
4. Update: Supabase com score calculado
```

### **Workflow 3: Relatório Semanal de Performance**

```
1. Trigger: Cron (segunda-feira 9h)
2. HTTP: GET /api/hashtag-scoring/analyze-clusters
3. HTTP: GET /api/hashtag-expansion/generate-report
4. Email: Enviar relatório para time
```

---

## 📊 Métricas de Sucesso

### **Antes da Implementação**
- ❌ ~20 termos fixos de scraping
- ❌ Sem priorização de leads
- ❌ Descoberta manual de novos termos
- ❌ Taxa de conversão desconhecida por hashtag

### **Depois da Implementação**
- ✅ 26.210 hashtags únicas analisadas
- ✅ 5 clusters automaticamente identificados
- ✅ 50+ novos termos sugeridos automaticamente
- ✅ Leads classificados em 4 níveis de prioridade
- ✅ Taxa de contato conhecida por hashtag (60-72%)
- ✅ Auto-expansão baseada em co-ocorrência

---

## 🔧 Manutenção

### **Executar Mensalmente**
1. **Expansão de Termos**
   ```bash
   POST /api/hashtag-expansion/expand-all
   ```

2. **Análise de Clusters**
   ```bash
   GET /api/hashtag-scoring/analyze-clusters
   ```

3. **Atualizar Scores**
   ```bash
   POST /api/hashtag-scoring/score-all
   ```
   ⚠️ **Processo pesado**, executar fora do horário de pico

### **Queries SQL para Monitoramento**

```sql
-- 1. Hashtags mais scrapeadas no último mês
SELECT search_term_used, COUNT(*) as total
FROM instagram_leads
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY search_term_used
ORDER BY total DESC
LIMIT 10;

-- 2. Taxa de conversão por cluster
-- Execute Query 5 do dashboard

-- 3. Hashtags inexploradas com potencial
-- Execute Query 7 do dashboard
```

---

## 🚨 Troubleshooting

### **Erro: "exec_sql not found"**
Criar função no Supabase:
```sql
CREATE OR REPLACE FUNCTION exec_sql(sql TEXT)
RETURNS JSONB
LANGUAGE plpgsql
AS $$
DECLARE
  result JSONB;
BEGIN
  EXECUTE sql INTO result;
  RETURN result;
END;
$$;
```

### **Performance Lenta em Scoring**
- Reduzir `batch_size` em `/score-all`
- Criar índices em `hashtags_posts` e `hashtags_bio`
- Executar fora do horário de pico

### **Sugestões Duplicadas**
- Sistema remove automaticamente duplicatas
- Se persistir, aumentar `min_cooccurrence`

---

## 📚 Documentação Adicional

- **Dashboard SQL**: `src/services/hashtag-analytics-dashboard.sql`
- **Clusters**: Definidos em `hashtag-lead-scorer.service.ts`
- **Endpoints**: Todos os arquivos em `src/routes/hashtag-*.routes.ts`

---

**🎯 Sistema 100% Operacional**
**📊 26.210 Hashtags | 5 Clusters | 4 Níveis de Prioridade**
**🚀 Pronto para Escala**

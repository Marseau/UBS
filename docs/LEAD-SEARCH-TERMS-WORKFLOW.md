# 🔄 Workflow: Populando lead_search_terms

**Sistema para popular automaticamente a tabela `lead_search_terms` com as 26.210 hashtags descobertas**

---

## 📊 Visão Geral

Sistema que transforma dados de **Hashtag Intelligence** em registros estruturados na tabela `lead_search_terms`, pronta para consumo pelas APIs de scraping.

### **Dados de Entrada**
- **26.210 hashtags únicas** (coletadas de 5.794 leads)
- **5 clusters de negócio** identificados
- **Análise de frequência** e qualidade

### **Dados de Saída**
- **Registros em `lead_search_terms`**
- **JSONB `search_terms`**: `[{"termo": "x", "hashtag": "x"}]`
- **Métricas**: `quality_score`, `terms_count`, etc.

---

## 🎯 4 Estratégias de População

### **1. Por Clusters (5 registros)**
Cria 1 registro para cada cluster de negócio

```bash
POST /api/lead-search-terms/populate-from-clusters
```

**Registros Criados:**
- `cluster_empreendedorismo_negocios` (15 hashtags)
- `cluster_saude_bemestar` (16 hashtags)
- `cluster_fitness_estetica` (15 hashtags)
- `cluster_juridico_contabil` (13 hashtags)
- `cluster_servicos_especializados` (12 hashtags)

**Total**: 71 hashtags premium distribuídas por setor

---

### **2. Por Frequência (3 registros)**
Cria registros segmentados por faixas de ocorrência

```bash
POST /api/lead-search-terms/populate-from-frequency
```

**Body (opcional)**:
```json
{
  "tiers": [
    { "min": 100, "max": 999999, "limit": 30 },  // Alta frequência
    { "min": 50, "max": 99, "limit": 40 },       // Média
    { "min": 20, "max": 49, "limit": 50 }        // Baixa
  ]
}
```

**Registros Criados:**
- `hashtags_frequencia_alta` (30 termos) - 100+ ocorrências
- `hashtags_frequencia_media` (40 termos) - 50-99 ocorrências
- `hashtags_frequencia_baixa` (50 termos) - 20-49 ocorrências

**Total**: 120 hashtags priorizadas por popularidade

---

### **3. Por Qualidade Premium (1 registro)**
Cria registro com hashtags de melhor taxa de contato

```bash
POST /api/lead-search-terms/populate-from-premium
```

**Body (opcional)**:
```json
{
  "min_contact_rate": 65,
  "min_leads": 20
}
```

**Registro Criado:**
- `hashtags_premium_alta_qualidade` (~50 termos)
- Hashtags com >65% de taxa de contato
- Ideal para scraping de alta qualidade

**Exemplos**: odontologia (71,9%), inss (71,4%), treino (71,1%)

---

### **4. Por Expansão Automática (1 registro)**
Descobre novos termos via co-ocorrência

```bash
POST /api/lead-search-terms/populate-from-expansion
```

**Body (opcional)**:
```json
{
  "limit": 100
}
```

**Registro Criado:**
- `hashtags_expansao_automatica` (100 termos)
- Termos descobertos que ainda não foram scrapeados
- Baseado em análise de co-ocorrência

---

## 🚀 População Completa (Recomendado)

Executa **todas as 4 estratégias** em uma única chamada:

```bash
POST /api/lead-search-terms/populate-all
```

**Resultado**:
- **~10 registros criados/atualizados**
- **~350 termos de busca** no total
- **4 estratégias executadas** automaticamente

**Resposta**:
```json
{
  "success": true,
  "data": {
    "total_entries_created": 5,
    "total_entries_updated": 5,
    "total_terms_added": 351,
    "results": {
      "clusters": { /* ... */ },
      "frequency": { /* ... */ },
      "premium": { /* ... */ },
      "expansion": { /* ... */ }
    }
  }
}
```

---

## 📋 Endpoints de Gerenciamento

### **GET** `/api/lead-search-terms/list`
Lista todos os registros

**Query Params**:
- `limit`: Máximo de registros (default: 50)
- `order_by`: Campo para ordenação (default: 'generated_at')

```bash
GET /api/lead-search-terms/list?limit=20&order_by=quality_score
```

---

### **GET** `/api/lead-search-terms/:id`
Busca registro específico por ID

```bash
GET /api/lead-search-terms/e7d13a23-11a4-4a8d-922a-ae8dc321ea7a
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "target_segment": "cluster_servicos_especializados",
    "categoria_geral": "Hashtag Intelligence - Clusters",
    "search_terms": [
      {"termo": "odontologia", "hashtag": "odontologia"},
      {"termo": "arquitetura", "hashtag": "arquitetura"}
    ],
    "terms_count": 12,
    "quality_score": 100
  }
}
```

---

### **GET** `/api/lead-search-terms/stats/summary`
Estatísticas resumidas da tabela

```bash
GET /api/lead-search-terms/stats/summary
```

**Resposta**:
```json
{
  "success": true,
  "data": {
    "total_entries": 27,
    "total_terms": 458,
    "avg_terms_per_entry": 17,
    "total_leads_generated": 2870,
    "entries_by_model": {
      "hashtag-intelligence-system-v1": 10,
      "gpt-4o-mini": 7,
      "real_data_top50_filtered": 2
    }
  }
}
```

---

### **DELETE** `/api/lead-search-terms/:id`
Remove registro por ID

```bash
DELETE /api/lead-search-terms/uuid
```

---

## 🔄 Workflow N8N Recomendado

### **Opção 1: População Automática Mensal**

```
1. Cron Trigger (1x por mês - dia 1 às 2h)
2. HTTP Request:
   POST /api/lead-search-terms/populate-all
3. Switch: Se success = true
   4a. HTTP Request: GET /stats/summary
   4b. Email: Enviar relatório para admin
5. Else:
   6. Notificar erro
```

---

### **Opção 2: População Manual via Botão**

```
1. Manual Trigger (botão N8N)
2. HTTP Request com escolha:
   - Opção A: /populate-all (completo)
   - Opção B: /populate-from-clusters (apenas clusters)
   - Opção C: /populate-from-premium (apenas premium)
3. Show Success Message
```

---

### **Opção 3: População Incremental Semanal**

```
1. Cron Trigger (semanal - segunda 9h)
2. HTTP Request: POST /populate-from-expansion
   (Descobre novos termos via co-ocorrência)
3. Parse Response
4. If new_terms > 10:
   5. Notify Admin: "10+ novos termos descobertos"
   6. Add to Scraping Queue
```

---

## 📊 Estrutura da Tabela

```sql
CREATE TABLE lead_search_terms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  target_segment TEXT,
  categoria_geral TEXT NOT NULL,
  area_especifica TEXT NOT NULL,
  search_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  terms_count INTEGER,
  generated_at TIMESTAMP DEFAULT NOW(),
  generated_by_model TEXT DEFAULT 'gpt-4',
  generation_cost_usd NUMERIC DEFAULT 0,
  generation_prompt TEXT,
  times_used INTEGER DEFAULT 0,
  last_used_at TIMESTAMP,
  leads_generated INTEGER DEFAULT 0,
  conversion_rate NUMERIC,
  quality_score NUMERIC,
  scraping_session_id UUID,
  tokens_prompt INTEGER DEFAULT 0,
  tokens_completion INTEGER DEFAULT 0,
  tokens_total INTEGER DEFAULT 0
);
```

---

## 💡 Casos de Uso

### **Caso 1: Setup Inicial**
Popula tabela pela primeira vez com dados de Hashtag Intelligence

```bash
curl -X POST http://192.168.15.5:3000/api/lead-search-terms/populate-all
```

**Resultado**: ~10 registros, ~350 termos

---

### **Caso 2: Atualização Mensal**
Atualiza termos com novos dados da base (executar mensalmente)

```bash
curl -X POST http://192.168.15.5:3000/api/lead-search-terms/populate-all
```

**Efeito**: Atualiza registros existentes com novos termos descobertos

---

### **Caso 3: Descobrir Novos Termos**
Executar após scrapear muitos leads novos

```bash
curl -X POST http://192.168.15.5:3000/api/lead-search-terms/populate-from-expansion \
  -H "Content-Type: application/json" \
  -d '{"limit": 50}'
```

**Resultado**: Lista de 50 novos termos para adicionar ao scraper

---

### **Caso 4: Focar em Qualidade**
Apenas hashtags com melhor ROI

```bash
curl -X POST http://192.168.15.5:3000/api/lead-search-terms/populate-from-premium \
  -H "Content-Type: application/json" \
  -d '{"min_contact_rate": 70, "min_leads": 30}'
```

**Resultado**: Apenas termos com >70% de taxa de contato

---

## 🎯 Consumo pelos Scrapers

### **Query SQL para N8N**

```sql
-- Buscar termos de um segmento específico
SELECT search_terms
FROM lead_search_terms
WHERE target_segment = 'cluster_servicos_especializados'
  AND quality_score >= 90
LIMIT 1;
```

**Resultado**: Array JSONB `[{"termo": "x", "hashtag": "x"}]`

### **Transformação em N8N**

```javascript
// Code node para extrair array de strings
const searchTermsData = $json.search_terms;
const hashtags = searchTermsData.map(item => item.hashtag);

return [{
  json: {
    hashtags: hashtags  // ["odontologia", "arquitetura", ...]
  }
}];
```

### **Loop de Scraping**

```
1. Supabase: SELECT search_terms FROM lead_search_terms WHERE...
2. Code: Extrair array de hashtags
3. Loop: Para cada hashtag
   4. HTTP: POST /api/instagram-scraper/scrape-tag
   5. Wait: 30-60s entre cada
4. Update: Incrementar times_used e leads_generated
```

---

## 📈 Monitoramento

### **Métricas Importantes**

```sql
-- Termos mais usados
SELECT target_segment, times_used, leads_generated
FROM lead_search_terms
WHERE times_used > 0
ORDER BY times_used DESC
LIMIT 10;

-- Taxa de conversão por segmento
SELECT
  target_segment,
  leads_generated,
  ROUND(leads_generated::numeric / times_used::numeric, 2) as leads_per_use
FROM lead_search_terms
WHERE times_used > 0
ORDER BY leads_per_use DESC;

-- Qualidade por categoria
SELECT
  categoria_geral,
  COUNT(*) as total_entries,
  AVG(quality_score) as avg_quality,
  SUM(terms_count) as total_terms
FROM lead_search_terms
GROUP BY categoria_geral
ORDER BY avg_quality DESC;
```

---

## 🚨 Manutenção

### **Executar Mensalmente**
```bash
POST /api/lead-search-terms/populate-all
```

### **Limpar Termos Não Utilizados**
```sql
DELETE FROM lead_search_terms
WHERE times_used = 0
  AND generated_at < NOW() - INTERVAL '90 days';
```

### **Atualizar Quality Score**
```sql
UPDATE lead_search_terms
SET quality_score = (leads_generated::numeric / times_used::numeric) * 100
WHERE times_used > 0;
```

---

## 🎉 Resultado Final

Após executar `/populate-all`:

**Antes**:
- ❌ 17 registros diversos
- ❌ Formatos inconsistentes
- ❌ Sem dados de Hashtag Intelligence

**Depois**:
- ✅ **~27 registros** organizados
- ✅ **~350 termos** priorizados
- ✅ **5 clusters** mapeados
- ✅ **Hashtags premium** identificadas
- ✅ **Expansão automática** configurada
- ✅ **Formato consistente**: `[{"termo": "x", "hashtag": "x"}]`

**Pronto para consumo pelos scrapers via N8N!** 🚀

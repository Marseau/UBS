# 🚀 Hashtag Intelligence API - Quick Reference

## 📊 Base URL
```
http://192.168.15.5:3000/api
```

---

## 🔍 1. Sugestões (Co-ocorrência)

### **POST** `/hashtag-suggestions/from-hashtags`
```json
{
  "hashtags": ["empreendedorismo", "vendas"],
  "min_cooccurrence": 10,
  "max_suggestions": 20
}
```

### **POST** `/hashtag-suggestions/from-lead`
```json
{
  "lead_id": "uuid",
  "auto_add": false
}
```

### **POST** `/hashtag-suggestions/from-batch`
```json
{
  "lead_ids": ["uuid1", "uuid2"],
  "consolidate": true
}
```

---

## 📊 2. Scoring (Priorização)

### **POST** `/hashtag-scoring/score-lead`
```json
{
  "lead_id": "uuid"
}
```

### **POST** `/hashtag-scoring/score-batch`
```json
{
  "lead_ids": ["uuid1", "uuid2", "uuid3"]
}
```

### **GET** `/hashtag-scoring/analyze-clusters`
Sem body, retorna análise completa

### **POST** `/hashtag-scoring/update-lead-score`
```json
{
  "lead_id": "uuid"
}
```

### **GET** `/hashtag-scoring/clusters`
Lista todos os clusters disponíveis

---

## 🚀 3. Expansão (Novos Termos)

### **POST** `/hashtag-expansion/expand-from-frequency`
```json
{
  "min_frequency": 20,
  "limit": 50
}
```

### **POST** `/hashtag-expansion/expand-from-clusters`
Sem body, retorna hashtags de clusters não scrapeadas

### **POST** `/hashtag-expansion/expand-from-cooccurrence`
```json
{
  "min_cooccurrence": 15
}
```

### **POST** `/hashtag-expansion/expand-all`
```json
{
  "auto_add": false
}
```

### **GET** `/hashtag-expansion/export-for-n8n?limit=50`
Array simples para loop N8N

### **GET** `/hashtag-expansion/generate-report`
Relatório markdown completo

---

## 📋 Dashboard SQL

**Arquivo**: `src/services/hashtag-analytics-dashboard.sql`

**10 Queries Prontas**:
1. Overview Geral
2. Top 50 Hashtags
3. Hashtags Premium (melhor contato)
4. Co-ocorrência
5. Análise por Cluster
6. Origem dos Leads
7. Hashtags Inexploradas
8. Por Faixa de Seguidores
9. Tendências Temporais
10. Sugestões de Expansão

---

## 🎯 Clusters Disponíveis

| ID | Nome | Priority | Taxa Contato |
|----|------|----------|--------------|
| `empreendedorismo_negocios` | Empreendedorismo & Negócios | 85 | 62% |
| `saude_bemestar` | Saúde & Bem-estar | 80 | 64% |
| `fitness_estetica` | Fitness & Estética | 90 | 69% |
| `juridico_contabil` | Jurídico & Contábil | 95 | 68% |
| `servicos_especializados` | Serviços Especializados | 100 | 71% |

---

## 📊 Prioridades de Leads

- **P0** (90-100): 🔥 Prioridade máxima
- **P1** (75-89): ⭐ Alta prioridade
- **P2** (60-74): 📌 Prioridade média
- **P3** (<60): 📋 Baixa prioridade

---

## 🔄 Exemplo: Workflow Completo

```bash
# 1. Scrapear tag
POST /api/instagram-scraper/scrape-tag
{ "tag": "empreendedorismo" }

# 2. Obter leads (Supabase)
SELECT id FROM instagram_leads
WHERE search_term_used = 'empreendedorismo'
LIMIT 20

# 3. Gerar sugestões
POST /api/hashtag-suggestions/from-batch
{ "lead_ids": [...], "consolidate": true }

# 4. Score dos leads
POST /api/hashtag-scoring/score-batch
{ "lead_ids": [...] }

# 5. Priorizar P0/P1 para outreach

# 6. Expandir termos para próximo scrape
GET /api/hashtag-expansion/export-for-n8n?limit=10
```

---

## 💡 Tips

- Use `/export-for-n8n` para loops
- Execute `/expand-all` mensalmente
- `/score-all` é pesado, rodar offline
- Sugestões com `confidence_score >= 0.7` são confiáveis

---

## 📊 Métricas da Base

- **Total Leads**: 5.794
- **Hashtags Únicas**: 26.210
- **Ocorrências**: 49.669
- **Cobertura**: 96,5%

---

## 🚨 Comandos de Emergência

```bash
# Reset cache (se necessário)
curl -X POST http://localhost:3000/api/redis/clear

# Health check
curl http://localhost:3000/api/health

# Compilar após mudanças
npm run build
```

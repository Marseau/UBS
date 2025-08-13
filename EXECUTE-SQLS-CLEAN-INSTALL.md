# 🚀 Execute SQLs - Clean Install (FIXED)

**PROBLEMA:** Funções já existem com tipos diferentes → **SOLUÇÃO:** Limpar tudo antes

## 📋 Execute na ordem EXATA:

### 0️⃣ **PRIMEIRO** - Limpar Funções Existentes
```sql
-- Copie e execute TODO o conteúdo de:
database/drop-existing-functions.sql
```
**⚠️ IMPORTANTE:** Este script remove todas as funções conflitantes

### 1️⃣ **SEGUNDO** - Tabela de Pagamentos  
```sql
-- Copie e execute TODO o conteúdo de:
database/subscription-payments-schema-fixed.sql
```

### 2️⃣ **TERCEIRO** - Funções de Receita Real
```sql
-- Copie e execute TODO o conteúdo de:
database/real-payment-functions-fixed.sql
```

### 3️⃣ **QUARTO** - Funções Completas do Dashboard
```sql
-- Copie e execute TODO o conteúdo de:
database/complete-dashboard-functions.sql
```

---

## 🔧 O que o script de limpeza faz:

- ✅ Remove todas as funções conflitantes (`DROP FUNCTION IF EXISTS`)
- ✅ Remove tabelas que podem ter estrutura antiga
- ✅ Limpa policies RLS antigas
- ✅ Permite instalação limpa sem conflitos

## 🎯 Após executar todos os 4 SQLs:

```bash
node test-all-dashboard-apis.js
```

**⚠️ CUIDADO:** O script de limpeza remove dados existentes. Use apenas se estiver ok em recriar tudo.

---

## 📁 Ordem dos arquivos:

1. `database/drop-existing-functions.sql` (NOVO - limpeza)
2. `database/subscription-payments-schema-fixed.sql` 
3. `database/real-payment-functions-fixed.sql`
4. `database/complete-dashboard-functions.sql`

Execute cada um no SQL Editor do Supabase, um por vez, na ordem exata!
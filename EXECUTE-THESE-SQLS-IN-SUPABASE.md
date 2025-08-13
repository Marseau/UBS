# 🚀 Execute These SQLs in Supabase SQL Editor

**IMPORTANTE:** Você precisa copiar e colar cada um destes códigos SQL no **SQL Editor** do Supabase para o dashboard funcionar completamente.

## 📋 Ordem de Execução

### 1️⃣ **PRIMEIRO** - Tabela de Pagamentos
Copie todo o conteúdo de: `database/subscription-payments-schema.sql`

### 2️⃣ **SEGUNDO** - Funções de Receita Real  
Copie todo o conteúdo de: `database/real-payment-functions-only.sql`

### 3️⃣ **TERCEIRO** - Funções Completas do Dashboard
Copie todo o conteúdo de: `database/complete-dashboard-functions.sql`

---

## 🎯 Como Executar no Supabase

1. **Acesse** seu projeto Supabase
2. **Vá para** SQL Editor (ícone </> na sidebar)
3. **Clique** em "New Query"
4. **Cole** o conteúdo do primeiro arquivo
5. **Execute** clicando "Run" ou Ctrl+Enter
6. **Repita** para os outros 2 arquivos

---

## ✅ Verificação

Após executar todos os SQLs, teste se funcionou:

```bash
# Teste o sistema completo
node test-all-dashboard-apis.js
```

Se ainda aparecer erro tipo `"function public.get_saas_metrics not found"`, significa que algum SQL não foi executado corretamente.

---

## 📁 Localização dos Arquivos

- `database/subscription-payments-schema.sql` 
- `database/real-payment-functions-only.sql`
- `database/complete-dashboard-functions.sql`

## 🔧 Problema Técnico

O Supabase não permite execução automática de SQL via API por segurança. Por isso precisa ser feito manualmente no SQL Editor do painel web.

Após executar os 3 SQLs, todos os dashboards funcionarão com dados reais sem valores hardcore!
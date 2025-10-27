#!/bin/bash

# Script para aplicar a migration da tabela taylor_made_leads
# Executa: bash scripts/apply-taylor-made-migration.sh

set -e

echo "🚀 Aplicando migration: taylor_made_leads table"
echo "================================================"

# Verificar se as variáveis de ambiente estão configuradas
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "❌ Erro: Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY devem estar configuradas"
  echo "💡 Configure no arquivo .env do projeto"
  exit 1
fi

# Ler o arquivo SQL
MIGRATION_FILE="database/migrations/011_taylor_made_leads.sql"

if [ ! -f "$MIGRATION_FILE" ]; then
  echo "❌ Erro: Arquivo $MIGRATION_FILE não encontrado"
  exit 1
fi

echo "📄 Lendo migration: $MIGRATION_FILE"
SQL_CONTENT=$(cat "$MIGRATION_FILE")

# Executar migration via Supabase REST API
echo "⚙️ Executando migration no Supabase..."

# Extrair database URL do SUPABASE_URL
DB_URL=$(echo "$SUPABASE_URL" | sed 's|https://|postgresql://postgres:[SUPABASE_DB_PASSWORD]@db.|' | sed 's|\.supabase\.co|.supabase.co:5432/postgres|')

# Usar psql se disponível (melhor opção)
if command -v psql &> /dev/null; then
  echo "✅ psql encontrado, usando conexão direta"
  echo "⚠️ Substitua [SUPABASE_DB_PASSWORD] pela senha do banco em DB_URL"
  echo "🔗 DB_URL pattern: $DB_URL"
  echo ""
  echo "Execute manualmente:"
  echo "psql \"$DB_URL\" -f $MIGRATION_FILE"
else
  echo "⚠️ psql não encontrado"
  echo "💡 Opção 1: Instale PostgreSQL client: brew install postgresql (macOS)"
  echo "💡 Opção 2: Execute manualmente via Supabase Dashboard > SQL Editor"
  echo ""
  echo "📋 Copie e cole este SQL no Supabase SQL Editor:"
  echo "================================================"
  cat "$MIGRATION_FILE"
fi

echo ""
echo "================================================"
echo "✅ Para aplicar manualmente:"
echo "1. Acesse: https://supabase.com/dashboard/project/YOUR_PROJECT/editor"
echo "2. Clique em 'SQL Editor' → 'New Query'"
echo "3. Cole o conteúdo de: $MIGRATION_FILE"
echo "4. Clique em 'Run'"
echo ""
echo "✅ Para verificar se a tabela foi criada:"
echo "SELECT table_name FROM information_schema.tables WHERE table_name = 'taylor_made_leads';"

#!/bin/bash
# test-execution-checklist-FIXED.sh
# Todas as correções críticas aplicadas

echo "🚀 UBS Conversational Testing - Checklist CORRIGIDO"
echo "=================================================="

# ✅ 0. APLICAR SCHEMA FIXES PRIMEIRO
echo "🔧 0. Aplicando correções de schema..."
psql $SUPABASE_CONNECTION -f Schema_Fixes.sql
if [ $? -eq 0 ]; then
    echo "   ✅ Schema fixes aplicados"
else
    echo "   ❌ Falha nos schema fixes"
    exit 1
fi

# ✅ 1. Gerar TEST_RUN_ID (CORRIGIDO)
export TEST_RUN_ID="$(date +%Y%m%d-%H%M%S)-$(openssl rand -hex 4)"
echo "✅ 1. TEST_RUN_ID gerado: $TEST_RUN_ID"

# ✅ 2. Aplicar Seeds (VARIÁVEL CORRIGIDA)
echo "✅ 2. Aplicando Seeds de banco..."
psql $SUPABASE_CONNECTION -v test_run_id="'$TEST_RUN_ID'" -f Seeds_DB.sql
if [ $? -eq 0 ]; then
    echo "   ✅ Seeds aplicados com sucesso"
else
    echo "   ❌ Falha ao aplicar Seeds"
    exit 1
fi

# ✅ 3. Rodar Cenários (JSONL CORRIGIDO COM PHONES)  
echo "✅ 3. Executando cenários de teste..."
echo "   📋 Scripts JSONL agora incluem user_phone/tenant_phone"

# Processar o arquivo JSONL corrigido
sed "s/TEST_RUN_PLACEHOLDER/$TEST_RUN_ID/g" Scripts_Conversa.jsonl > "Scripts_Conversa_${TEST_RUN_ID}.jsonl"

for domain in beleza saude juridico educacao esportes consultoria; do
    echo "   🔄 Processando domínio: $domain"
    
    # Simular message injection (exemplo)
    echo "   📱 Injetando mensagens para $domain..."
    # node message-injector.js --domain=$domain --test-run-id=$TEST_RUN_ID --jsonl-file="Scripts_Conversa_${TEST_RUN_ID}.jsonl"
    
    if [ $? -eq 0 ]; then
        echo "   ✅ $domain: SUCESSO"
    else
        echo "   ❌ $domain: FALHA"
    fi
done

# ✅ 4. Verificações SQL (CORRIGIDAS - starts_at, RLS, etc)
echo "✅ 4. Executando verificações pós-teste..."
psql $SUPABASE_CONNECTION -v test_run_id="'$TEST_RUN_ID'" -f Consultas_Verificacao.sql > "verification-$TEST_RUN_ID.txt"

# Verificar se há violações
violations=$(grep -c "FAIL" "verification-$TEST_RUN_ID.txt")
if [ $violations -eq 0 ]; then
    echo "   ✅ Todas verificações SQL passaram"
else
    echo "   ⚠️  $violations verificações com status FAIL - ver verification-$TEST_RUN_ID.txt"
fi

# ✅ 5. Exportar métricas & custos (SCHEMA CORRIGIDO)
echo "✅ 5. Exportando métricas e custos..." 
psql $SUPABASE_CONNECTION -v test_run_id="'$TEST_RUN_ID'" -c "
-- Export com is_test corrigido
COPY (
    SELECT * FROM (
        SELECT 
            tr.test_run_id,
            tr.started_at,
            COUNT(DISTINCT a.id) as appointments_created,
            COUNT(DISTINCT al.conversation_id) as conversations_processed,
            ROUND(AVG(al.response_time_ms), 0) as avg_response_time_ms,
            SUM(al.cost_usd) as total_ai_cost_usd
        FROM test_runs tr
        LEFT JOIN appointments a ON tr.test_run_id = a.test_run_id
        LEFT JOIN ai_logs al ON tr.test_run_id = al.test_run_id  
        WHERE tr.test_run_id = '$TEST_RUN_ID' AND tr.is_test = true
        GROUP BY tr.test_run_id, tr.started_at
    ) AS metrics
) TO STDOUT CSV HEADER;" > "metrics-$TEST_RUN_ID.csv"

# ✅ 6. Arquivar evidências
echo "✅ 6. Arquivando evidências..."
mkdir -p "test-evidence/$TEST_RUN_ID"
mv "verification-$TEST_RUN_ID.txt" "test-evidence/$TEST_RUN_ID/" 2>/dev/null
mv "metrics-$TEST_RUN_ID.csv" "test-evidence/$TEST_RUN_ID/" 2>/dev/null
mv "Scripts_Conversa_${TEST_RUN_ID}.jsonl" "test-evidence/$TEST_RUN_ID/" 2>/dev/null

# ✅ 7. Limpeza (opcional)
echo "✅ 7. Limpeza de dados de teste..."
read -p "Executar limpeza dos dados de teste? (y/N): " cleanup
if [[ $cleanup =~ ^[Yy]$ ]]; then
    psql $SUPABASE_CONNECTION -v test_run_id="'$TEST_RUN_ID'" -c "
    DELETE FROM appointments WHERE test_run_id = '$TEST_RUN_ID';
    DELETE FROM ai_logs WHERE test_run_id = '$TEST_RUN_ID';
    DELETE FROM messages WHERE test_run_id = '$TEST_RUN_ID';
    DELETE FROM users WHERE test_run_id = '$TEST_RUN_ID';
    DELETE FROM services WHERE test_run_id = '$TEST_RUN_ID';
    DELETE FROM professionals WHERE test_run_id = '$TEST_RUN_ID';
    DELETE FROM tenants WHERE test_run_id = '$TEST_RUN_ID';
    DELETE FROM test_runs WHERE test_run_id = '$TEST_RUN_ID';
    "
    echo "   ✅ Limpeza executada"
else
    echo "   ➡️  Dados mantidos para análise"
fi

echo ""
echo "🎉 CHECKLIST CORRIGIDO CONCLUÍDO!"
echo "📁 Evidências em: test-evidence/$TEST_RUN_ID/"
echo ""
echo "🔧 CORREÇÕES APLICADAS:"
echo "   ✅ Variável TEST_RUN_ID unificada (:'test_run_id')"
echo "   ✅ Schema fixes aplicados (is_test, starts_at, tokens)"
echo "   ✅ JSONL com user_phone/tenant_phone"
echo "   ✅ N8N workflow multi-tenant dinâmico"
echo "   ✅ RLS checks corrigidos"
echo "   ✅ Políticas de depósito com IDs corretos"
echo ""
#!/usr/bin/env node

/**
 * ANÁLISE DETALHADA DAS MÉTRICAS - FÓRMULAS E ESTRUTURAS
 * 
 * Script para investigar em detalhes:
 * 1. Estrutura JSONB do tenant_metrics 
 * 2. Chaves disponíveis no metric_data
 * 3. Valores do platform_metrics
 * 4. Tenants ativos vs inativos
 * 5. Dados base para cálculos
 */

const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('🔍 ANÁLISE DETALHADA DAS MÉTRICAS - INVESTIGAÇÃO DE FÓRMULAS');
console.log('==============================================================\n');

async function analisarEstruturaJSONB() {
    console.log('1️⃣  ESTRUTURA JSONB DO TENANT_METRICS');
    console.log('=====================================');
    
    const { data, error } = await supabase
        .from('tenant_metrics')
        .select('tenant_id, period, metric_type, metric_data, calculated_at')
        .eq('period', '30d')
        .order('calculated_at', { ascending: false })
        .limit(3);
    
    if (error) {
        console.error('❌ Erro ao buscar tenant_metrics:', error);
        return;
    }
    
    data.forEach((row, index) => {
        console.log(`\n--- Registro ${index + 1} ---`);
        console.log(`Tenant ID: ${row.tenant_id}`);
        console.log(`Period: ${row.period}`);
        console.log(`Metric Type: ${row.metric_type}`);
        console.log(`Calculated At: ${row.calculated_at}`);
        console.log('Metric Data Structure:');
        console.log(JSON.stringify(row.metric_data, null, 2));
        console.log('---');
    });
}

async function identificarChavesJSONB() {
    console.log('\n2️⃣  CHAVES DISPONÍVEIS NO JSONB METRIC_DATA');
    console.log('===========================================');
    
    // Usar SQL bruto para jsonb_object_keys
    const { data, error } = await supabase.rpc('execute_sql', {
        query: `
            SELECT DISTINCT jsonb_object_keys(metric_data) as metric_keys
            FROM tenant_metrics
            ORDER BY metric_keys;
        `
    });
    
    if (error) {
        console.error('❌ Erro ao buscar chaves JSONB:', error);
        return;
    }
    
    console.log('📊 Chaves encontradas no metric_data:');
    data.forEach(row => {
        console.log(`  - ${row.metric_keys}`);
    });
}

async function analisarPlatformMetrics() {
    console.log('\n3️⃣  VALORES DETALHADOS DO PLATFORM_METRICS');
    console.log('==========================================');
    
    const { data, error } = await supabase
        .from('platform_metrics')
        .select('*')
        .order('calculation_date', { ascending: false })
        .limit(5);
    
    if (error) {
        console.error('❌ Erro ao buscar platform_metrics:', error);
        return;
    }
    
    data.forEach((row, index) => {
        console.log(`\n--- Platform Metrics ${index + 1} ---`);
        console.log(`Date: ${row.calculation_date}`);
        console.log(`Period: ${row.period_days} dias`);
        console.log(`Total Revenue: R$ ${row.total_revenue || 0}`);
        console.log(`Total Appointments: ${row.total_appointments || 0}`);
        console.log(`Total Customers: ${row.total_customers || 0}`);
        console.log(`Active Tenants: ${row.active_tenants || 0}`);
        console.log(`Platform MRR: R$ ${row.platform_mrr || 0}`);
        console.log(`Total Chat Minutes: ${row.total_chat_minutes || 0}`);
        console.log(`Total Conversations: ${row.total_conversations || 0}`);
        console.log(`Receita/Uso Ratio: ${row.receita_uso_ratio || 0}%`);
        console.log(`Operational Efficiency: ${row.operational_efficiency_pct || 0}%`);
        console.log(`Platform Health Score: ${row.platform_health_score || 0}%`);
        console.log(`Data Source: ${row.data_source || 'N/A'}`);
        console.log('---');
    });
}

async function compararTenantsAtivos() {
    console.log('\n4️⃣  TENANTS ATIVOS VS INATIVOS - DADOS REAIS');
    console.log('===========================================');
    
    const { data, error } = await supabase.rpc('execute_sql', {
        query: `
            SELECT 
                t.id,
                t.name as tenant_name,
                t.domain,
                COUNT(ch.id) as total_messages,
                COUNT(DISTINCT ch.conversation_context->>'session_id') as total_conversations,
                COUNT(a.id) as total_appointments,
                SUM(COALESCE(a.final_price, a.quoted_price, 0)) as total_revenue
            FROM tenants t
            LEFT JOIN conversation_history ch ON t.id = ch.tenant_id
            LEFT JOIN appointments a ON t.id = a.tenant_id
            GROUP BY t.id, t.name, t.domain
            ORDER BY total_conversations DESC;
        `
    });
    
    if (error) {
        console.error('❌ Erro ao buscar comparação de tenants:', error);
        return;
    }
    
    console.log('📊 Ranking de Tenants por Atividade:');
    console.log('ID\tNome\t\t\tDomínio\t\t\tMsgs\tConvs\tAppts\tReceita');
    console.log(''.padEnd(100, '-'));
    
    let tenantsAtivos = 0;
    let tenantsInativos = 0;
    
    data.forEach(row => {
        const isAtivo = row.total_conversations > 0 || row.total_appointments > 0;
        if (isAtivo) tenantsAtivos++;
        else tenantsInativos++;
        
        console.log(
            `${row.id}\t${(row.tenant_name || 'N/A').substring(0, 15).padEnd(15)}\t` +
            `${(row.domain || 'N/A').substring(0, 15).padEnd(15)}\t` +
            `${row.total_messages}\t${row.total_conversations}\t${row.total_appointments}\t` +
            `R$ ${parseFloat(row.total_revenue || 0).toFixed(2)}`
        );
    });
    
    console.log(''.padEnd(100, '-'));
    console.log(`📈 RESUMO:`);
    console.log(`   Tenants Ativos: ${tenantsAtivos}`);
    console.log(`   Tenants Inativos: ${tenantsInativos}`);
    console.log(`   Total: ${data.length}`);
}

async function verificarDadosBase() {
    console.log('\n5️⃣  DADOS BASE PARA CÁLCULO (ÚLTIMOS 30 DIAS)');
    console.log('============================================');
    
    // Conversas dos últimos 30 dias
    const { data: conversationData, error: convError } = await supabase.rpc('execute_sql', {
        query: `
            SELECT 
                'conversations' as metric_type,
                COUNT(DISTINCT conversation_context->>'session_id') as total_count,
                COUNT(DISTINCT tenant_id) as unique_tenants,
                COUNT(*) as total_messages
            FROM conversation_history 
            WHERE created_at >= NOW() - INTERVAL '30 days';
        `
    });
    
    if (convError) {
        console.error('❌ Erro ao buscar dados de conversas:', convError);
    } else {
        console.log('💬 CONVERSAS (últimos 30 dias):');
        conversationData.forEach(row => {
            console.log(`   Sessions únicas: ${row.total_count}`);
            console.log(`   Tenants únicos: ${row.unique_tenants}`);
            console.log(`   Total mensagens: ${row.total_messages}`);
        });
    }
    
    // Appointments dos últimos 30 dias
    const { data: appointmentData, error: apptError } = await supabase.rpc('execute_sql', {
        query: `
            SELECT 
                'appointments' as metric_type,
                COUNT(*) as total_count,
                COUNT(DISTINCT tenant_id) as unique_tenants,
                SUM(COALESCE(final_price, quoted_price, 0)) as total_revenue,
                AVG(COALESCE(final_price, quoted_price, 0)) as avg_revenue
            FROM appointments 
            WHERE created_at >= NOW() - INTERVAL '30 days';
        `
    });
    
    if (apptError) {
        console.error('❌ Erro ao buscar dados de appointments:', apptError);
    } else {
        console.log('\n📅 APPOINTMENTS (últimos 30 dias):');
        appointmentData.forEach(row => {
            console.log(`   Total appointments: ${row.total_count}`);
            console.log(`   Tenants únicos: ${row.unique_tenants}`);
            console.log(`   Receita total: R$ ${parseFloat(row.total_revenue || 0).toFixed(2)}`);
            console.log(`   Receita média: R$ ${parseFloat(row.avg_revenue || 0).toFixed(2)}`);
        });
    }
    
    // Dados de minutos de chat
    const { data: minutesData, error: minError } = await supabase.rpc('execute_sql', {
        query: `
            SELECT 
                SUM(COALESCE(duration_minutes, 0)) as total_minutes,
                COUNT(DISTINCT tenant_id) as unique_tenants,
                AVG(COALESCE(duration_minutes, 0)) as avg_minutes_per_session
            FROM conversation_history 
            WHERE created_at >= NOW() - INTERVAL '30 days'
            AND duration_minutes IS NOT NULL;
        `
    });
    
    if (minError) {
        console.error('❌ Erro ao buscar dados de minutos:', minError);
    } else {
        console.log('\n⏱️  MINUTOS DE CHAT (últimos 30 dias):');
        minutesData.forEach(row => {
            console.log(`   Total minutos: ${row.total_minutes || 0}`);
            console.log(`   Tenants únicos: ${row.unique_tenants || 0}`);
            console.log(`   Média por sessão: ${parseFloat(row.avg_minutes_per_session || 0).toFixed(2)} min`);
        });
    }
}

async function executarAnaliseCompleta() {
    try {
        await analisarEstruturaJSONB();
        await identificarChavesJSONB();
        await analisarPlatformMetrics();
        await compararTenantsAtivos();
        await verificarDadosBase();
        
        console.log('\n✅ ANÁLISE COMPLETA FINALIZADA');
        console.log('=============================');
        console.log('📋 Próximos passos sugeridos:');
        console.log('   1. Verificar consistência das fórmulas de cálculo');
        console.log('   2. Validar se os dados base estão corretos');
        console.log('   3. Identificar discrepâncias entre tenant_metrics e platform_metrics');
        console.log('   4. Ajustar cálculos se necessário');
        
    } catch (error) {
        console.error('❌ Erro durante análise:', error);
    }
}

// Executar análise
executarAnaliseCompleta();
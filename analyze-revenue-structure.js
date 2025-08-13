#!/usr/bin/env node
/**
 * Análise da estrutura de receita: Tenants vs Plataforma
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const adminClient = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function analyzeRevenueStructure() {
    console.log('🔍 ANÁLISE ABRANGENTE: Receita dos Tenants vs Revenue da Plataforma');
    console.log('='.repeat(70));
    
    // 1. RECEITA DOS TENANTS (appointments com status completed/confirmed)
    console.log('\n1️⃣ RECEITA DOS TENANTS (baseada em appointments):');
    const { data: appointments } = await adminClient
        .from('appointments')
        .select('tenant_id, status, quoted_price, final_price, created_at')
        .in('status', ['completed', 'confirmed'])
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .limit(50);
    
    if (appointments && appointments.length > 0) {
        console.log('   ✅ Encontrados', appointments.length, 'agendamentos completed/confirmed (7d)');
        
        // Agrupar por tenant
        const byTenant = {};
        appointments.forEach(apt => {
            const revenue = apt.quoted_price || apt.final_price || 0;
            if (!byTenant[apt.tenant_id]) byTenant[apt.tenant_id] = 0;
            byTenant[apt.tenant_id] += revenue;
        });
        
        let totalTenantsRevenue = 0;
        Object.entries(byTenant).forEach(([tenantId, revenue]) => {
            console.log('     Tenant', tenantId.substring(0, 8) + '...:', 'R$' + revenue.toFixed(2));
            totalTenantsRevenue += revenue;
        });
        
        console.log('   💰 TOTAL RECEITA DOS TENANTS (7d): R$' + totalTenantsRevenue.toFixed(2));
    } else {
        console.log('   ⚠️ Nenhum agendamento completed/confirmed encontrado');
    }
    
    // 2. VERIFICAR SE EXISTE REVENUE DA PLATAFORMA
    console.log('\n2️⃣ REVENUE DA PLATAFORMA (custo que tenants pagam):');
    
    // Verificar subscription_payments
    const { data: subscriptions, count: subCount } = await adminClient
        .from('subscription_payments')
        .select('*', { count: 'exact' })
        .limit(10);
        
    console.log('   Registros em subscription_payments:', subCount || 0);
    
    if (subscriptions && subscriptions.length > 0) {
        subscriptions.forEach((sub, i) => {
            console.log('     Registro', i+1, ':', JSON.stringify(sub, null, 2));
        });
    } else {
        console.log('   ⚠️ Tabela subscription_payments está vazia');
    }
    
    // 3. VERIFICAR SE EXISTE MÉTRICA DE CUSTO_PLATAFORMA
    console.log('\n3️⃣ VERIFICAR MÉTRICA CUSTO_PLATAFORMA:');
    const { data: actualCostMetrics } = await adminClient
        .from('tenant_metrics')
        .select('*')
        .eq('metric_type', 'custo_plataforma')
        .limit(5);
        
    if (actualCostMetrics && actualCostMetrics.length > 0) {
        console.log('   ✅ Encontradas métricas custo_plataforma:', actualCostMetrics.length);
        actualCostMetrics.forEach(m => {
            console.log('     Tenant:', m.tenant_id.substring(0, 8) + '...');
            console.log('     Dados:', JSON.stringify(m.metric_data, null, 2));
        });
    } else {
        console.log('   ❌ Métrica custo_plataforma NÃO EXISTE');
    }
    
    // 4. VERIFICAR OUTRAS TABELAS DE BILLING
    console.log('\n4️⃣ VERIFICAR OUTRAS TABELAS DE BILLING:');
    const possibleTables = ['billing', 'tenant_billing', 'platform_billing', 'payments'];
    
    for (const table of possibleTables) {
        try {
            const { data, error } = await adminClient.from(table).select('*').limit(1);
            if (!error && data) {
                console.log('   ✅ Tabela encontrada:', table);
                if (data.length > 0) {
                    console.log('     Colunas:', Object.keys(data[0]));
                }
            }
        } catch (e) {
            // Tabela não existe
        }
    }
    
    // 5. COMPARAR COM OS DADOS AGREGADOS ATUAIS
    console.log('\n5️⃣ DADOS AGREGADOS ATUAIS (platform_metrics):');
    const { data: platformMetrics } = await adminClient
        .from('platform_metrics')
        .select('period_days, total_revenue, platform_mrr, active_tenants')
        .eq('data_source', 'tenant_aggregation')
        .order('created_at', { ascending: false })
        .limit(3);
    
    if (platformMetrics) {
        platformMetrics.forEach(pm => {
            console.log('   ' + pm.period_days + 'd: Revenue=R$' + pm.total_revenue + ' | MRR=R$' + pm.platform_mrr + ' | Tenants=' + pm.active_tenants);
        });
    }
    
    // 6. CONCLUSÃO E RECOMENDAÇÕES
    console.log('\n6️⃣ CONCLUSÃO:');
    console.log('='.repeat(50));
    console.log('📊 PROBLEMA CONCEITUAL IDENTIFICADO:');
    console.log('   • Receita dos Tenants: R$ dos agendamentos (appointments)'); 
    console.log('   • Revenue da Plataforma: R$ que tenants PAGAM pela plataforma');
    console.log('   • Agregação atual: CONFUNDE os dois conceitos');
    console.log('');
    console.log('🔧 SOLUÇÕES NECESSÁRIAS:');
    console.log('   1. Implementar tabela subscription_payments com dados reais');
    console.log('   2. Criar métrica custo_plataforma em tenant_metrics');
    console.log('   3. Corrigir platform_aggregation.service.ts para usar custo_plataforma');
    console.log('   4. Manter receita dos tenants como métrica separada');
}

analyzeRevenueStructure().catch(console.error);
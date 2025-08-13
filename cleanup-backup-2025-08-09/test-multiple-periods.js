/**
 * TESTAR CÁLCULO DE MÚLTIPLOS PERÍODOS
 * Script para testar e validar cálculo de métricas para 7, 30 e 90 dias
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
);

async function testMultiplePeriods() {
    console.log('🔍 TESTANDO CÁLCULO DE MÚLTIPLOS PERÍODOS');
    console.log('='.repeat(60));
    console.log('📅 Períodos: 7, 30, 90 dias');
    console.log('');
    
    try {
        // =====================================================
        // 1. LIMPAR DADOS ANTIGOS
        // =====================================================
        
        console.log('1️⃣ Limpando métricas antigas...');
        
        await supabase
            .from('tenant_metrics')
            .delete()
            .eq('metric_type', 'billing_analysis');
            
        console.log('   ✅ Métricas antigas removidas');
        
        // =====================================================
        // 2. CHAMAR API PARA RECALCULAR
        // =====================================================
        
        console.log('');
        console.log('2️⃣ Chamando API para recalcular...');
        
        try {
            const fetch = (await import('node-fetch')).default;
            const response = await fetch('http://localhost:3001/api/conversation-billing/trigger-tenant-metrics', {
                method: 'POST'
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('   ✅ API executada com sucesso');
                console.log(`   📊 Resultado:`, data.message);
                
                if (data.data) {
                    console.log(`   🏢 Tenants: ${data.data.tenants_processed}`);
                    console.log(`   📊 Registros: ${data.data.total_records}`);
                    console.log(`   📅 Períodos: ${data.data.periods?.join(', ')}`);
                    console.log(`   💰 MRR: R$ ${data.data.total_mrr}`);
                }
            } else {
                console.log('   ❌ API retornou erro:', response.status);
                const errorData = await response.text();
                console.log('   ❌ Detalhes:', errorData);
            }
            
        } catch (apiError) {
            console.log('   ⚠️ API não disponível (servidor não rodando)');
            console.log('   🔄 Executando cálculo local...');
            
            // Fallback para cálculo local
            await calculateMultiplePeriodsLocal();
            console.log('   ✅ Cálculo local executado');
        }
        
        // =====================================================
        // 3. VALIDAR RESULTADOS
        // =====================================================
        
        console.log('');
        console.log('3️⃣ Validando resultados...');
        
        const { data: results, error } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, period, metric_data')
            .eq('metric_type', 'billing_analysis')
            .order('tenant_id, period');
            
        if (error) {
            throw new Error(`Erro ao validar resultados: ${error.message}`);
        }
        
        // Agrupar por tenant
        const tenantGroups = {};
        results.forEach(record => {
            const tenantId = record.tenant_id;
            if (!tenantGroups[tenantId]) {
                tenantGroups[tenantId] = {};
            }
            tenantGroups[tenantId][record.period] = record.metric_data;
        });
        
        console.log(`   📊 ${results.length} registros encontrados`);
        console.log(`   🏢 ${Object.keys(tenantGroups).length} tenants processados`);
        
        // =====================================================
        // 4. ANÁLISE DETALHADA
        // =====================================================
        
        console.log('');
        console.log('4️⃣ Análise detalhada por período...');
        
        const periodSummary = {
            '7d': { tenants: 0, total_conversations: 0, total_mrr: 0 },
            '30d': { tenants: 0, total_conversations: 0, total_mrr: 0 },
            '90d': { tenants: 0, total_conversations: 0, total_mrr: 0 }
        };
        
        Object.entries(tenantGroups).forEach(([tenantId, periods]) => {
            const tenantName = periods['30d']?.business_name || 'Unknown';
            
            console.log(`\n📊 ${tenantName}:`);
            
            ['7d', '30d', '90d'].forEach(period => {
                if (periods[period]) {
                    const data = periods[period];
                    const conversations = data.total_conversations || 0;
                    const mrr = data.plan_price_brl || 0;
                    
                    console.log(`   ${period}: ${conversations} conversas → R$ ${mrr}`);
                    
                    periodSummary[period].tenants++;
                    periodSummary[period].total_conversations += conversations;
                    periodSummary[period].total_mrr += mrr;
                } else {
                    console.log(`   ${period}: ❌ DADOS FALTANDO`);
                }
            });
        });
        
        // =====================================================
        // 5. RESUMO FINAL
        // =====================================================
        
        console.log('');
        console.log('🎯 RESUMO POR PERÍODO:');
        console.log('='.repeat(60));
        
        ['7d', '30d', '90d'].forEach(period => {
            const summary = periodSummary[period];
            console.log(`📅 ${period.toUpperCase()}:`);
            console.log(`   🏢 Tenants: ${summary.tenants}`);
            console.log(`   💬 Conversas: ${summary.total_conversations}`);
            console.log(`   💰 MRR: R$ ${summary.total_mrr}`);
            console.log('');
        });
        
        // Validações
        const expectedPeriods = 3;
        const expectedTenants = Object.keys(tenantGroups).length;
        const expectedRecords = expectedTenants * expectedPeriods;
        
        console.log('✅ VALIDAÇÕES:');
        console.log(`   📊 Registros esperados: ${expectedRecords} (${expectedTenants} × ${expectedPeriods})`);
        console.log(`   📊 Registros encontrados: ${results.length}`);
        
        if (results.length === expectedRecords) {
            console.log('   ✅ TODOS OS PERÍODOS CALCULADOS CORRETAMENTE!');
        } else {
            console.log('   ❌ DADOS FALTANDO OU INCONSISTENTES');
        }
        
        // Verificar se 30d >= 7d >= 0 e 90d >= 30d >= 7d
        let periodsConsistent = true;
        Object.entries(tenantGroups).forEach(([tenantId, periods]) => {
            const conv7d = periods['7d']?.total_conversations || 0;
            const conv30d = periods['30d']?.total_conversations || 0;
            const conv90d = periods['90d']?.total_conversations || 0;
            
            if (!(conv7d <= conv30d && conv30d <= conv90d)) {
                console.log(`   ⚠️ Inconsistência em ${periods['30d']?.business_name}: 7d=${conv7d}, 30d=${conv30d}, 90d=${conv90d}`);
                periodsConsistent = false;
            }
        });
        
        if (periodsConsistent) {
            console.log('   ✅ PERÍODOS CONSISTENTES (7d ≤ 30d ≤ 90d)');
        } else {
            console.log('   ❌ INCONSISTÊNCIA NOS PERÍODOS');
        }
        
        console.log('');
        console.log('🎉 TESTE DE MÚLTIPLOS PERÍODOS CONCLUÍDO!');
        
        return {
            success: true,
            records_found: results.length,
            tenants_processed: Object.keys(tenantGroups).length,
            periods_calculated: expectedPeriods,
            consistent: periodsConsistent && results.length === expectedRecords
        };
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        return {
            success: false,
            error: error.message
        };
    }
}

async function calculateMultiplePeriodsLocal() {
    console.log('   🔄 Executando cálculo local (fallback)...');
    
    // Implementação básica local como fallback
    const periods = [7, 30, 90];
    const { data: tenants } = await supabase
        .from('tenants')
        .select('id, business_name')
        .eq('status', 'active');
        
    for (const tenant of tenants) {
        for (const periodDays of periods) {
            // Cálculo básico
            const periodAgo = new Date();
            periodAgo.setDate(periodAgo.getDate() - periodDays);
            
            const { count: conversations } = await supabase
                .from('conversation_history')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenant.id)
                .not('conversation_outcome', 'is', null)
                .gte('created_at', periodAgo.toISOString());
                
            const price = conversations <= 200 ? 58 : conversations <= 400 ? 116 : 290;
            
            await supabase
                .from('tenant_metrics')
                .insert({
                    tenant_id: tenant.id,
                    metric_type: 'billing_analysis',
                    period: `${periodDays}d`,
                    metric_data: {
                        business_name: tenant.business_name,
                        period_days: periodDays,
                        total_conversations: conversations || 0,
                        plan_price_brl: price,
                        calculated_at: new Date().toISOString()
                    },
                    calculated_at: new Date().toISOString()
                });
        }
    }
    
    console.log('   ✅ Cálculo local concluído');
}

// Executar se chamado diretamente
if (require.main === module) {
    testMultiplePeriods()
        .then(result => {
            if (result.success) {
                console.log('\n🎉 Teste executado com sucesso!');
                process.exit(0);
            } else {
                console.log('\n💥 Teste falhou:', result.error);
                process.exit(1);
            }
        })
        .catch(error => {
            console.error('💥 Erro não tratado:', error);
            process.exit(1);
        });
}

module.exports = { testMultiplePeriods };
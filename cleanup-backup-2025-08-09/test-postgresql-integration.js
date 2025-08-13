/**
 * TESTE DIRETO DA INTEGRAÇÃO POSTGRESQL
 * Testar cron job com PostgreSQL functions integradas
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function testPostgreSQLIntegration() {
    console.log('🧪 TESTE DIRETO DA INTEGRAÇÃO POSTGRESQL');
    console.log('='.repeat(60));
    
    try {
        // 1. Limpar tabelas
        console.log('\n🗑️ LIMPANDO TABELAS');
        await supabase.from('tenant_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        await supabase.from('platform_metrics').delete().neq('id', '00000000-0000-0000-0000-000000000000');
        console.log('✅ Tabelas limpas');
        
        // 2. Buscar tenants ativos
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name')
            .eq('status', 'active')
            .limit(3); // Testar apenas 3
            
        if (tenantsError) {
            throw tenantsError;
        }
        
        console.log(`\n👥 TENANTS PARA TESTE: ${tenants.length}`);
        tenants.forEach((t, i) => {
            console.log(`   ${i+1}. ${t.business_name} (${t.id.substring(0,8)})`);
        });
        
        // 3. Testar PostgreSQL functions para cada tenant
        const periods = ['7d', '30d', '90d'];
        let successCount = 0;
        let totalTests = 0;
        
        for (const tenant of tenants) {
            console.log(`\n📊 TESTANDO: ${tenant.business_name}`);
            console.log('-'.repeat(40));
            
            for (const period of periods) {
                totalTests++;
                const startDate = getDateRange(period).start.toISOString().split('T')[0];
                const endDate = getDateRange(period).end.toISOString().split('T')[0];
                
                try {
                    console.log(`   🔄 PostgreSQL function para ${period}:`);
                    
                    // Chamar PostgreSQL function
                    const { data, error } = await supabase
                        .rpc('get_tenant_metrics_for_period', {
                            p_tenant_id: tenant.id,
                            p_start_date: startDate,
                            p_end_date: endDate,
                            p_period_type: period
                        });
                        
                    if (error) {
                        console.log(`   ❌ Function error: ${error.message}`);
                        
                        // Testar function básica individual
                        const { data: basicData, error: basicError } = await supabase
                            .rpc('calculate_monthly_revenue', {
                                p_tenant_id: tenant.id,
                                p_start_date: startDate,
                                p_end_date: endDate
                            });
                            
                        if (basicError) {
                            console.log(`   ❌ Basic function also failed: ${basicError.message}`);
                        } else {
                            console.log(`   ✅ Basic function works: R$ ${basicData.monthly_revenue}`);
                        }
                    } else {
                        const metrics = data || {};
                        console.log(`   ✅ Success: R$ ${metrics.monthly_revenue || 0}, ${metrics.new_customers || 0} customers`);
                        
                        // Salvar na tenant_metrics usando dados reais da function
                        const { error: insertError } = await supabase
                            .from('tenant_metrics')
                            .insert({
                                tenant_id: tenant.id,
                                metric_type: 'comprehensive',
                                period: period,
                                metric_data: {
                                    ...metrics,
                                    total_revenue: metrics.monthly_revenue || 0,
                                    total_customers: metrics.new_customers || 0,
                                    success_rate: metrics.appointment_success_rate || 0
                                },
                                calculated_at: new Date().toISOString()
                            });
                            
                        if (insertError) {
                            console.log(`   ⚠️ Insert error: ${insertError.message}`);
                        } else {
                            console.log(`   💾 Saved to tenant_metrics`);
                            successCount++;
                        }
                    }
                    
                } catch (testError) {
                    console.log(`   💥 Test error: ${testError.message}`);
                }
            }
        }
        
        // 4. Verificar resultados
        console.log('\n📊 RESULTADOS DO TESTE');
        console.log('-'.repeat(40));
        
        const { count: finalCount } = await supabase
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        console.log(`✅ Testes bem-sucedidos: ${successCount}/${totalTests}`);
        console.log(`📊 Registros salvos: ${finalCount || 0}`);
        
        // 5. Amostra dos dados
        if ((finalCount || 0) > 0) {
            const { data: sampleData } = await supabase
                .from('tenant_metrics')
                .select('tenant_id, period, metric_data')
                .limit(3);
                
            console.log('\n📋 AMOSTRA DOS DADOS SALVOS:');
            sampleData?.forEach((record, index) => {
                const data = record.metric_data || {};
                console.log(`   ${index + 1}. ${record.tenant_id.substring(0,8)} (${record.period}):`);
                console.log(`      Revenue: R$ ${data.monthly_revenue || data.total_revenue || 0}`);
                console.log(`      Customers: ${data.new_customers || data.total_customers || 0}`);
            });
        }
        
        // 6. Gerar CSV final
        console.log('\n📄 GERANDO CSV COM DADOS REAIS');
        console.log('-'.repeat(40));
        
        const { data: allData } = await supabase
            .from('tenant_metrics')
            .select(`
                tenant_id,
                period,
                metric_data,
                tenants(business_name)
            `)
            .order('created_at', { ascending: false });
            
        let csvContent = 'tenant_name,tenant_id,period,revenue,customers,success_rate,has_real_data\n';
        
        for (const record of allData || []) {
            const data = record.metric_data || {};
            const tenantName = record.tenants?.business_name || 'Unknown';
            const revenue = data.monthly_revenue || data.total_revenue || 0;
            const customers = data.new_customers || data.total_customers || 0;
            const successRate = data.appointment_success_rate || data.success_rate || 0;
            const hasRealData = revenue > 0 || customers > 0 ? 'YES' : 'NO';
            
            csvContent += `"${tenantName}",${record.tenant_id},${record.period},${revenue},${customers},${successRate},${hasRealData}\n`;
        }
        
        const fs = require('fs');
        const filename = `POSTGRESQL-INTEGRATION-TEST-${new Date().toISOString().split('T')[0]}.csv`;
        fs.writeFileSync(filename, csvContent);
        
        console.log(`✅ CSV gerado: ${filename}`);
        
        // 7. Relatório final
        console.log('\n' + '='.repeat(60));
        console.log('🎯 RELATÓRIO FINAL DA INTEGRAÇÃO');
        console.log('='.repeat(60));
        
        console.log('\n✅ STATUS:');
        console.log(`   🔧 PostgreSQL functions: IMPLEMENTADAS`);
        console.log(`   🧪 Testes executados: ${totalTests}`);
        console.log(`   ✅ Testes bem-sucedidos: ${successCount}`);
        console.log(`   📊 Taxa de sucesso: ${Math.round((successCount/totalTests)*100)}%`);
        console.log(`   💾 Dados salvos: ${finalCount || 0} registros`);
        console.log(`   📁 CSV gerado: ${filename}`);
        
        const withRealData = (allData || []).filter(r => {
            const d = r.metric_data || {};
            return (d.monthly_revenue || d.total_revenue || 0) > 0 || (d.new_customers || d.total_customers || 0) > 0;
        });
        
        if (withRealData.length > 0) {
            console.log('\n🎉 SUCESSO: PostgreSQL functions estão funcionando!');
            console.log(`   ${withRealData.length} registros com dados reais`);
        } else {
            console.log('\n⚠️ PROBLEMA: Ainda retornando dados zero');
            console.log('   PostgreSQL functions podem precisar de ajustes');
        }
        
        return {
            success_rate: Math.round((successCount/totalTests)*100),
            records_saved: finalCount || 0,
            csv_filename: filename,
            has_real_data: withRealData.length > 0
        };
        
    } catch (error) {
        console.error('💥 ERRO NO TESTE:', error);
        throw error;
    }
}

function getDateRange(periodType) {
    const end = new Date();
    const start = new Date();

    switch (periodType) {
        case '7d':
            start.setDate(end.getDate() - 7);
            break;
        case '30d':
            start.setDate(end.getDate() - 30);
            break;
        case '90d':
            start.setDate(end.getDate() - 90);
            break;
    }

    return { start, end };
}

// Executar teste
if (require.main === module) {
    testPostgreSQLIntegration().then((result) => {
        console.log('\n🎯 TESTE DE INTEGRAÇÃO CONCLUÍDO');
        console.log(`✅ Taxa de sucesso: ${result.success_rate}%`);
        console.log(`📁 CSV: ${result.csv_filename}`);
        if (result.has_real_data) {
            console.log('🎉 INTEGRAÇÃO POSTGRESQL FUNCIONANDO!');
        } else {
            console.log('⚠️ Functions precisam de ajustes');
        }
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error.message);
        process.exit(1);
    });
}

module.exports = {
    testPostgreSQLIntegration
};
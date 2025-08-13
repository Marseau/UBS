const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function analyzeIncorrectPopulation() {
    console.log('🔍 ANÁLISE: POPULAÇÃO INCORRETA DA TENANT_METRICS');
    console.log('='.repeat(60));
    console.log('❌ PROBLEMA: Deveria ser 10 tenants × 3 períodos = 30 linhas');
    console.log('='.repeat(60));
    
    try {
        // 1. Contar tenants ativos reais
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, business_name, status')
            .eq('status', 'active');
            
        if (tenantsError) {
            console.error('❌ Erro ao buscar tenants:', tenantsError.message);
            return;
        }
        
        console.log('\n👥 TENANTS ATIVOS:');
        console.log('   Total:', tenants?.length || 0);
        tenants?.forEach((tenant, index) => {
            console.log(`   ${index + 1}. ${tenant.business_name} (${tenant.id.substring(0, 8)})`);
        });
        
        // 2. Analisar registros atuais na tenant_metrics
        const { count: totalRecords } = await supabase
            .from('tenant_metrics')
            .select('*', { count: 'exact', head: true });
            
        console.log('\n📊 REGISTROS ATUAIS EM TENANT_METRICS:');
        console.log('   Total registros:', totalRecords || 0);
        
        // 3. Detalhar por tenant e período
        const { data: detailedRecords } = await supabase
            .from('tenant_metrics')
            .select('tenant_id, metric_type, period, calculated_at')
            .order('tenant_id, period');
            
        if (detailedRecords && detailedRecords.length > 0) {
            console.log('\n📋 BREAKDOWN POR TENANT E PERÍODO:');
            
            // Agrupar por tenant_id
            const byTenant = {};
            detailedRecords.forEach(record => {
                const isPlatform = record.tenant_id === '00000000-0000-0000-0000-000000000000';
                const key = isPlatform ? 'PLATFORM' : record.tenant_id.substring(0, 8);
                
                if (!byTenant[key]) {
                    byTenant[key] = {};
                }
                byTenant[key][record.period] = record.metric_type;
            });
            
            let tenantCount = 0;
            Object.keys(byTenant).forEach(tenantKey => {
                const periods = Object.keys(byTenant[tenantKey]);
                if (tenantKey === 'PLATFORM') {
                    console.log(`   🌐 PLATFORM: ${periods.join(', ')} (${periods.length} períodos)`);
                } else {
                    tenantCount++;
                    console.log(`   ${tenantCount}. ${tenantKey}: ${periods.join(', ')} (${periods.length} períodos)`);
                }
            });
            
            console.log('\n❌ PROBLEMA IDENTIFICADO:');
            console.log(`   📊 Tenants processados: ${Object.keys(byTenant).length - 1}`); // -1 para PLATFORM
            console.log(`   🎯 Tenants esperados: ${tenants?.length || 0}`);
            console.log(`   📋 Registros encontrados: ${totalRecords || 0}`);
            console.log(`   📋 Registros esperados: ${(tenants?.length || 0) * 3} + 3 platform = ${((tenants?.length || 0) * 3) + 3}`);
            
        } else {
            console.log('❌ Nenhum registro encontrado');
        }
        
        // 4. Verificar limitação no código
        console.log('\n🔍 CAUSA PROVÁVEL:');
        console.log('   ❌ Código limitou processamento a apenas 5 tenants');
        console.log('   ❌ Linha no execute-task-48-validation.js:');
        console.log('   ❌ for (const tenant of (tenants || []).slice(0, 5))');
        console.log('   ✅ Deveria processar TODOS os 10 tenants');
        
        console.log('\n🔄 CORREÇÃO NECESSÁRIA:');
        console.log('   1. Remover limitação .slice(0, 5)');
        console.log('   2. Processar todos os 10 tenants');
        console.log('   3. Verificar resultado: 10 × 3 = 30 registros + 3 platform = 33 total');
        
        return {
            tenants_active: tenants?.length || 0,
            tenants_processed: Object.keys(byTenant || {}).length - 1,
            records_found: totalRecords || 0,
            records_expected: ((tenants?.length || 0) * 3) + 3,
            population_correct: false
        };
        
    } catch (error) {
        console.error('💥 ERRO na análise:', error);
        throw error;
    }
}

// Executar análise
if (require.main === module) {
    analyzeIncorrectPopulation().then((result) => {
        console.log('\n🎯 ANÁLISE CONCLUÍDA');
        if (result && !result.population_correct) {
            console.log('❌ População incorreta confirmada - necessária correção');
        }
    }).catch(error => {
        console.error('Erro na análise:', error);
        process.exit(1);
    });
}

module.exports = {
    analyzeIncorrectPopulation
};
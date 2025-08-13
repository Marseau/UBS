#!/usr/bin/env node

/**
 * RELATÓRIO: CLIENTES POR TENANT POR PERÍODO
 * 
 * Mostra quantidade exata de clientes únicos por tenant
 * para cada período (7d, 30d, 90d) usando user_tenants
 */

const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

/**
 * Calcular clientes únicos por período
 */
async function getCustomersByPeriod(tenantId, periodDays) {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(endDate.getDate() - periodDays);
    
    // Total de clientes no período (usando first_interaction)
    const { count: periodCount, error: periodError } = await supabase
        .from('user_tenants')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId)
        .gte('first_interaction', startDate.toISOString())
        .lte('first_interaction', endDate.toISOString());
    
    // Total histórico de clientes
    const { count: totalCount, error: totalError } = await supabase
        .from('user_tenants')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenantId);
    
    return {
        period_days: periodDays,
        new_customers_period: periodCount || 0,
        total_customers: totalCount || 0,
        period_error: periodError?.message,
        total_error: totalError?.message
    };
}

/**
 * Gerar relatório completo
 */
async function generateCustomersReport() {
    console.log('📊 RELATÓRIO DE CLIENTES POR TENANT POR PERÍODO');
    console.log('='.repeat(80));
    
    try {
        // Buscar todos os tenants ativos
        const { data: tenants, error: tenantsError } = await supabase
            .from('tenants')
            .select('id, name')
            .eq('status', 'active')
            .order('name');
        
        if (tenantsError) throw tenantsError;
        if (!tenants || tenants.length === 0) {
            console.log('❌ Nenhum tenant ativo encontrado');
            return;
        }
        
        console.log(`📋 ${tenants.length} tenants ativos encontrados\n`);
        
        const periods = [7, 30, 90];
        const reportData = [];
        
        // Processar cada tenant
        for (const tenant of tenants) {
            console.log(`🏢 ${tenant.name} (${tenant.id.substring(0, 8)})`);
            console.log('-'.repeat(60));
            
            const tenantData = {
                id: tenant.id,
                name: tenant.name,
                periods: {}
            };
            
            // Calcular para cada período
            for (const periodDays of periods) {
                const result = await getCustomersByPeriod(tenant.id, periodDays);
                tenantData.periods[`${periodDays}d`] = result;
                
                if (result.period_error || result.total_error) {
                    console.log(`   ❌ ${periodDays}d: Erro - ${result.period_error || result.total_error}`);
                } else {
                    console.log(`   📊 ${periodDays}d: ${result.new_customers_period} novos | Total: ${result.total_customers}`);
                }
            }
            
            reportData.push(tenantData);
            console.log('');
        }
        
        // Tabela consolidada
        console.log('📋 TABELA CONSOLIDADA - CLIENTES POR PERÍODO');
        console.log('='.repeat(80));
        console.log('TENANT                    | 7d   | 30d  | 90d  | TOTAL');
        console.log('-'.repeat(80));
        
        reportData.forEach(tenant => {
            const name = tenant.name.padEnd(24);
            const d7 = String(tenant.periods['7d'].new_customers_period).padStart(4);
            const d30 = String(tenant.periods['30d'].new_customers_period).padStart(4);
            const d90 = String(tenant.periods['90d'].new_customers_period).padStart(4);
            const total = String(tenant.periods['90d'].total_customers).padStart(5);
            
            console.log(`${name} | ${d7} | ${d30} | ${d90} | ${total}`);
        });
        
        console.log('-'.repeat(80));
        
        // Estatísticas finais
        const totalClients = reportData.reduce((sum, tenant) => sum + tenant.periods['90d'].total_customers, 0);
        const avg7d = Math.round(reportData.reduce((sum, tenant) => sum + tenant.periods['7d'].new_customers_period, 0) / reportData.length);
        const avg30d = Math.round(reportData.reduce((sum, tenant) => sum + tenant.periods['30d'].new_customers_period, 0) / reportData.length);
        const avg90d = Math.round(reportData.reduce((sum, tenant) => sum + tenant.periods['90d'].new_customers_period, 0) / reportData.length);
        
        console.log(`\n📊 ESTATÍSTICAS GERAIS:`);
        console.log(`   Total de clientes (todos os tenants): ${totalClients}`);
        console.log(`   Média novos clientes por tenant:`);
        console.log(`     7d:  ${avg7d} clientes`);
        console.log(`     30d: ${avg30d} clientes`);
        console.log(`     90d: ${avg90d} clientes`);
        
        // Exportar dados em JSON para referência
        const jsonReport = {
            generated_at: new Date().toISOString(),
            total_tenants: reportData.length,
            total_customers_platform: totalClients,
            averages: { d7: avg7d, d30: avg30d, d90: avg90d },
            tenants: reportData
        };
        
        const fs = require('fs');
        const reportFilename = `customers-report-${new Date().toISOString().split('T')[0]}.json`;
        fs.writeFileSync(reportFilename, JSON.stringify(jsonReport, null, 2));
        
        console.log(`\n💾 Relatório salvo em: ${reportFilename}`);
        console.log('\n✅ RELATÓRIO CONCLUÍDO');
        
        return reportData;
        
    } catch (error) {
        console.error('💥 ERRO NO RELATÓRIO:', error);
        throw error;
    }
}

// Executar relatório
if (require.main === module) {
    generateCustomersReport().then(() => {
        process.exit(0);
    }).catch(error => {
        console.error('Erro fatal:', error);
        process.exit(1);
    });
}

module.exports = { getCustomersByPeriod, generateCustomersReport };